import {
  BasesAllOptions,
  BasesEntry,
  BasesPropertyId,
  BasesView,
  DateValue,
  Menu,
  Modal,
  Notice,
  Platform,
  Setting,
  parsePropertyId,
  QueryController,
  setIcon,
} from "obsidian";
import React, { StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import { CalendarHandle, CalendarReactView } from "./CalendarReactView";
import { AppContext } from "./context";
import { resolveColor } from "./colors";

export const CalendarViewType = "calendar";

export interface CalendarEntry {
  entry: BasesEntry;
  startDate: Date;
  endDate?: Date;
  allDay: boolean;
  backgroundColor?: string;
  borderColor?: string;
}

export class CalendarView extends BasesView {
  type = CalendarViewType;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  root: Root | null = null;
  calendarHandleRef = React.createRef<CalendarHandle | null>();

  private entries: CalendarEntry[] = [];
  private startDateProp: BasesPropertyId | null = null;
  private endDateProp: BasesPropertyId | null = null;
  private colorProp: BasesPropertyId | null = null;
  private detailProp: BasesPropertyId | null = null;
  private weekStartDay: number = 1;
  private scrollToTime: string = "08:00:00";
  private currentView: string = "workWeek";
  private slotDuration: string = "00:30:00";

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.scrollEl = scrollEl;
    this.containerEl = scrollEl.createDiv({
      cls: "bases-calendar-container is-loading",
      attr: { tabIndex: 0 },
    });
  }

  onload(): void {}

  onunload() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.entries = [];
  }

  onResize(): void {
    this.calendarHandleRef.current?.updateSize();
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    this.containerEl.removeClass("is-loading");
    this.loadConfig();
    this.updateCalendar();
  }

  public setEphemeralState(state: unknown): void {
    if (state && typeof state === "object") {
      const s = state as Record<string, unknown>;
      if (typeof s.currentView === "string") this.currentView = s.currentView;
      if (typeof s.slotDuration === "string") this.slotDuration = s.slotDuration;
    }
  }

  public getEphemeralState(): unknown {
    return { currentView: this.currentView, slotDuration: this.slotDuration };
  }

  private loadConfig(): void {
    this.startDateProp = this.config.getAsPropertyId("startDate");
    this.endDateProp = this.config.getAsPropertyId("endDate");
    this.colorProp = this.config.getAsPropertyId("colorProperty");
    this.detailProp = this.config.getAsPropertyId("detailProperty");

    const weekStartDayValue = this.config.get("weekStartDay") as string;
    const dayNameToNumber: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    this.weekStartDay = weekStartDayValue
      ? (dayNameToNumber[weekStartDayValue] ?? 1)
      : 1;

    const scrollTimeValue = this.config.get("scrollToTime") as string;
    this.scrollToTime = scrollTimeValue || "08:00:00";
  }

  private updateCalendar(): void {
    if (!this.data || !this.startDateProp) {
      this.root?.unmount();
      this.root = null;
      this.containerEl.empty();
      this.containerEl.createDiv("bases-calendar-empty").textContent =
        "Configure a start date property to display entries";
      return;
    }

    this.entries = [];
    for (const entry of this.data.data) {
      const result = this.extractDate(entry, this.startDateProp);
      if (result) {
        const endDate = this.endDateProp
          ? (this.extractDate(entry, this.endDateProp)?.date ?? undefined)
          : undefined;

        let colorProps: Pick<CalendarEntry, "backgroundColor" | "borderColor"> = {};
        if (this.colorProp) {
          try {
            const colorValue = entry.getValue(this.colorProp);
            if (colorValue) {
              const resolved = resolveColor(colorValue.toString());
              if (resolved) colorProps = resolved;
            }
          } catch {
            // skip
          }
        }

        this.entries.push({
          entry,
          startDate: result.date,
          endDate,
          allDay: !result.hasTimed,
          ...colorProps,
        });
      }
    }

    this.renderReactCalendar();
  }

  private renderReactCalendar(): void {
    if (!this.root) {
      this.root = createRoot(this.containerEl);
    }

    this.root.render(
      <StrictMode>
        <AppContext.Provider value={this.app}>
          <CalendarReactView
            entries={this.entries}
            weekStartDay={this.weekStartDay}
            initialView={this.currentView}
            initialSlotDuration={this.slotDuration}
            scrollToTime={this.scrollToTime}
            detailProperty={this.detailProp}
            properties={this.config.getOrder() || []}
            onViewChange={(view) => { this.currentView = view; }}
            onZoomChange={(dur) => { this.slotDuration = dur; }}
            onEntryClick={(entry, isModEvent) => {
              void this.app.workspace.openLinkText(
                entry.file.path,
                "",
                isModEvent,
              );
            }}
            onEntryContextMenu={(evt, entry) => {
              evt.preventDefault();
              this.showEntryContextMenu(evt.nativeEvent, entry);
            }}
            onEventDrop={(entry, newStart, newEnd, allDay) =>
              this.updateEntryDates(entry, newStart, newEnd, allDay)
            }
            editable={this.isEditable()}
            calendarHandleRef={this.calendarHandleRef}
          />
        </AppContext.Provider>
      </StrictMode>,
    );
  }

  private isEditable(): boolean {
    if (!this.startDateProp) return false;
    const startDateProperty = parsePropertyId(this.startDateProp);
    if (startDateProperty.type !== "note") return false;

    if (!this.endDateProp) return true;
    const endDateProperty = parsePropertyId(this.endDateProp);
    if (endDateProperty.type !== "note") return false;

    return true;
  }

  private extractDate(
    entry: BasesEntry,
    propId: BasesPropertyId,
  ): { date: Date; hasTimed: boolean } | null {
    try {
      const value = entry.getValue(propId);
      if (!value) return null;
      if (!(value instanceof DateValue)) return null;
      // Private API — DateValue exposes .date and .time
      if ("date" in value && value.date && value.date instanceof Date) {
        const hasTimed = Boolean("time" in value && (value as { time?: unknown }).time);
        return { date: value.date, hasTimed };
      }
      return null;
    } catch (error) {
      console.error(`Error extracting date for ${entry.file.name}:`, error);
      return null;
    }
  }

  private showEntryContextMenu(evt: MouseEvent, entry: BasesEntry): void {
    const file = entry.file;
    const calendarEntry = this.entries.find((item) => item.entry.file.path === file.path);
    if (Platform.isPhone) {
      // A shared context menu also receives actions for links rendered inside the
      // event. A private menu keeps this menu about the event's own note.
      const menu = new Menu();
      if (this.isEditable() && calendarEntry) {
        menu.addItem((item) =>
          item
            .setSection("reschedule")
            .setTitle("Zmień termin")
            .setIcon("calendar-clock")
            .onClick(() => {
              new RescheduleModal(this.app, calendarEntry, (start, end, allDay) =>
                this.updateEntryDates(entry, start, end, allDay),
              ).open();
            }),
        );
        menu.addSeparator();
      }
      menu.addItem((item) =>
        item
          .setSection("navigation")
          .setTitle("Otwórz notatkę")
          .setIcon("file-text")
          .onClick(() => void this.app.workspace.openLinkText(file.path, "", false)),
      );
      menu.addItem((item) =>
        item
          .setSection("navigation")
          .setTitle("Otwórz w nowej karcie")
          .setIcon("file-plus")
          .onClick(() => void this.app.workspace.openLinkText(file.path, "", true)),
      );
      menu.showAtMouseEvent(evt);
      return;
    }

    const menu = Menu.forEvent(evt);
    this.app.workspace.handleLinkContextMenu(menu, file.path, "");
    if (this.isEditable() && calendarEntry) {
      menu.addItem((item) =>
        item
          .setSection("action")
          .setTitle("Zmień termin")
          .setIcon("calendar-clock")
          .onClick(() => {
            new RescheduleModal(this.app, calendarEntry, (start, end, allDay) =>
              this.updateEntryDates(entry, start, end, allDay),
            ).open();
          }),
      );
    }
    menu.addItem((item) =>
      item
        .setSection("danger")
        .setTitle("Delete file")
        .setIcon("lucide-trash-2")
        .setWarning(true)
        .onClick(() => this.app.fileManager.promptForDeletion(file)),
    );
  }

  private async updateEntryDates(
    entry: BasesEntry,
    newStart: Date,
    newEnd?: Date,
    allDay?: boolean,
  ): Promise<void> {
    if (!this.startDateProp) throw new Error("Start date is not configured");

    const file = entry.file;
    const extractedStartProp = this.startDateProp.startsWith("note.")
      ? this.startDateProp.slice(5)
      : null;
    const extractedEndProp = this.endDateProp?.startsWith("note.")
      ? this.endDateProp.slice(5)
      : null;

    if (
      extractedStartProp === null ||
      (this.endDateProp && extractedEndProp === null)
    ) {
      throw new Error("Date properties are not editable note properties");
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[extractedStartProp] = allDay
        ? formatDate(newStart)
        : formatDateTime(newStart);

      if (this.endDateProp && newEnd && extractedEndProp) {
        frontmatter[extractedEndProp] = allDay
          ? formatDate(newEnd)
          : formatDateTime(newEnd);
      }
    });
  }

  static getViewOptions(): BasesAllOptions[] {
    return [
      {
        displayName: "Date properties",
        type: "group",
        items: [
          {
            displayName: "Start date",
            type: "property",
            key: "startDate",
            placeholder: "Property",
          },
          {
            displayName: "End date (optional)",
            type: "property",
            key: "endDate",
            placeholder: "Property",
          },
        ],
      },
      {
        displayName: "Event display",
        type: "group",
        items: [
          {
            displayName: "Detail property",
            type: "property",
            key: "detailProperty",
            placeholder: "Property shown on 2nd line (e.g. people)",
          },
          {
            displayName: "Color property",
            type: "property",
            key: "colorProperty",
            placeholder: "Property (e.g. tomato, sage, peacock…)",
          },
        ],
      },
      {
        displayName: "Calendar options",
        type: "group",
        items: [
          {
            displayName: "Week starts on",
            type: "dropdown",
            key: "weekStartDay",
            default: "monday",
            options: {
              sunday: "Sunday",
              monday: "Monday",
              tuesday: "Tuesday",
              wednesday: "Wednesday",
              thursday: "Thursday",
              friday: "Friday",
              saturday: "Saturday",
            },
          },
          {
            displayName: "Day starts at",
            type: "dropdown",
            key: "scrollToTime",
            default: "08:00:00",
            options: {
              "00:00:00": "Midnight",
              "06:00:00": "6:00 AM",
              "07:00:00": "7:00 AM",
              "08:00:00": "8:00 AM",
              "09:00:00": "9:00 AM",
              "10:00:00": "10:00 AM",
            },
          },
        ],
      },
    ];
  }
}

class RescheduleModal extends Modal {
  constructor(
    app: CalendarView["app"],
    private readonly calendarEntry: CalendarEntry,
    private readonly onSave: (start: Date, end: Date | undefined, allDay: boolean) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const { startDate, endDate, allDay } = this.calendarEntry;
    this.modalEl.addClass("bases-calendar-reschedule-modal");
    contentEl.empty();
    const file = this.calendarEntry.entry.file;
    let title = file.basename;
    const cachedTitle = this.app.metadataCache.getFileCache(file)?.frontmatter?.title;
    if (typeof cachedTitle === "string" && cachedTitle.trim()) title = cachedTitle.trim();
    try {
      const value = this.calendarEntry.entry.getValue("note.title");
      if (value?.isTruthy()) title = value.toString().trim() || title;
    } catch {
      // Keep the file name when this Base does not expose note.title.
    }
    const heading = contentEl.createEl("h2", { cls: "bases-calendar-reschedule-title" });
    const iconName = typeof this.app.metadataCache.getFileCache(file)?.frontmatter?.icon === "string"
      ? String(this.app.metadataCache.getFileCache(file)?.frontmatter?.icon).replace(/^lucide[-/:]+/, "").trim()
      : "";
    if (iconName) {
      const icon = heading.createSpan({ cls: "bases-calendar-reschedule-entity-icon", attr: { "aria-hidden": "true" } });
      setIcon(icon, iconName);
      if (!icon.querySelector("svg")) icon.remove();
    }
    heading.createSpan({ text: title });
    contentEl.createEl("p", { text: "Zmień termin", cls: "bases-calendar-reschedule-subtitle" });

    let dateInput!: HTMLInputElement;
    let timeInput: HTMLInputElement;
    let selectedAllDay = allDay;
    new Setting(contentEl).setName("Data").addText((text) => {
      dateInput = text.inputEl;
      dateInput.type = "date";
      dateInput.value = formatDate(startDate);
      dateInput.setAttribute("aria-label", "Nowa data");
    });
    const weekendNotice = contentEl.createDiv({
      cls: "bases-calendar-weekend-notice",
      attr: { role: "status", "aria-live": "polite" },
    });
    const shortcuts = contentEl.createDiv({
      cls: "bases-calendar-date-shortcuts",
      attr: { role: "group", "aria-label": "Szybki wybór daty" },
    });
    const shortcutButtons: { day: string; button: HTMLButtonElement }[] = [];
    const syncDateState = () => {
      for (const { day, button } of shortcutButtons) {
        const selected = dateInput.value === day;
        button.setAttribute("aria-pressed", String(selected));
        button.toggleClass("is-selected", selected);
      }
      const selectedDate = parseLocalDate(dateInput.value, undefined, true);
      const weekday = selectedDate?.getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      dateInput.toggleClass("is-weekend", isWeekend);
      weekendNotice.hidden = !isWeekend;
      weekendNotice.setText(isWeekend
        ? `${weekday === 6 ? "Sobota" : "Niedziela"} — termin wypada w weekend`
        : "");
    };
    for (const [label, days] of [
      ["Jutro", 1],
      ["Pojutrze", 2],
      ["Za tydzień", 7],
    ] as const) {
      const target = new Date();
      target.setDate(target.getDate() + days);
      const day = formatDate(target);
      const weekday = target.getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const dateLabel = target.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
      const weekdayLabel = weekday === 6 ? "sob." : "niedz.";
      const button = shortcuts.createEl("button", {
        cls: "bases-calendar-date-shortcut",
        attr: {
          type: "button",
          "aria-label": `${label}, ${target.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
          "aria-pressed": "false",
        },
      });
      const labelRow = button.createSpan({ cls: "bases-calendar-date-shortcut-label" });
      labelRow.createSpan({ text: label });
      const check = labelRow.createSpan({ cls: "bases-calendar-date-shortcut-check", attr: { "aria-hidden": "true" } });
      setIcon(check, "check");
      button.createSpan({
        text: isWeekend ? `${weekdayLabel} ${dateLabel}` : dateLabel,
        cls: `bases-calendar-date-shortcut-value${isWeekend ? " is-weekend" : ""}`,
      });
      button.addEventListener("click", () => {
        dateInput.value = day;
        dateInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      shortcutButtons.push({ day, button });
    }
    dateInput.addEventListener("input", syncDateState);
    dateInput.addEventListener("change", syncDateState);
    syncDateState();
    new Setting(contentEl).setName("Cały dzień").addToggle((toggle) => {
      toggle.setValue(allDay).onChange((value) => {
        selectedAllDay = value;
        timeInput.disabled = value;
      });
    });
    new Setting(contentEl).setName("Godzina").addText((text) => {
      timeInput = text.inputEl;
      timeInput.type = "time";
      timeInput.value = allDay ? "09:00" : formatTime(startDate);
      timeInput.disabled = allDay;
      timeInput.setAttribute("aria-label", "Nowa godzina");
    });

    new Setting(contentEl).setClass("bases-calendar-reschedule-actions")
      .addButton((button) =>
        button.setButtonText("Anuluj").onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("Zapisz")
          .setCta()
          .onClick(async () => {
            const nextStart = parseLocalDate(dateInput.value, timeInput.value, selectedAllDay);
            if (!nextStart) {
              new Notice("Wybierz poprawną datę i godzinę");
              return;
            }
            const nextEnd = shiftEndDate(startDate, endDate, nextStart, allDay);
            button.setDisabled(true);
            try {
              await this.onSave(nextStart, nextEnd, selectedAllDay);
              this.close();
              new Notice("Termin zmieniony");
            } catch (error) {
              console.error("Could not reschedule calendar entry:", error);
              new Notice("Nie udało się zmienić terminu");
              button.setDisabled(false);
            }
          }),
      );
  }
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseLocalDate(day: string, time: string | undefined, allDay: boolean): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const date = Number(dayText);
  let hour = 0;
  let minute = 0;
  if (!allDay) {
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(time ?? "");
    if (!timeMatch) return null;
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  }
  const result = new Date(year, month, date, hour, minute);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month ||
    result.getDate() !== date ||
    result.getHours() !== hour ||
    result.getMinutes() !== minute
  ) return null;
  return result;
}

function shiftEndDate(
  oldStart: Date,
  oldEnd: Date | undefined,
  newStart: Date,
  allDay: boolean,
): Date | undefined {
  if (!oldEnd) return undefined;
  if (!allDay) return new Date(newStart.getTime() + oldEnd.getTime() - oldStart.getTime());
  const oldStartDay = Date.UTC(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate());
  const oldEndDay = Date.UTC(oldEnd.getFullYear(), oldEnd.getMonth(), oldEnd.getDate());
  const dayOffset = Math.round((oldEndDay - oldStartDay) / 86_400_000);
  const newEnd = new Date(newStart);
  newEnd.setDate(newEnd.getDate() + dayOffset);
  return newEnd;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTime(date: Date): string {
  const base = formatDate(date);
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${base}T${h}:${min}`;
}
