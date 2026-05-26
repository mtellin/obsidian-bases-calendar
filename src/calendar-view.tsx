import {
  BasesAllOptions,
  BasesEntry,
  BasesPropertyId,
  BasesView,
  DateValue,
  Menu,
  parsePropertyId,
  QueryController,
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
    const menu = Menu.forEvent(evt);
    this.app.workspace.handleLinkContextMenu(menu, file.path, "");
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
    if (!this.startDateProp) return;

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
      return;
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
