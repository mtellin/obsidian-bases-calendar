import type {
  EventApi,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  ViewMountArg,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { BasesEntry, BasesPropertyId, DateValue, Value } from "obsidian";
import React, { useCallback, useEffect, useRef } from "react";

import { CalendarEntry } from "./calendar-view";
import { useApp } from "./hooks";

export interface CalendarHandle {
  updateSize(): void;
}

interface CalendarReactViewProps {
  entries: CalendarEntry[];
  weekStartDay: number;
  initialView: string;
  scrollToTime: string;
  properties: BasesPropertyId[];
  onViewChange: (view: string) => void;
  onEntryClick: (entry: BasesEntry, isModEvent: boolean) => void;
  onEntryContextMenu: (evt: React.MouseEvent, entry: BasesEntry) => void;
  onEventDrop?: (
    entry: BasesEntry,
    newStart: Date,
    newEnd?: Date,
    allDay?: boolean,
  ) => Promise<void>;
  editable: boolean;
  calendarHandleRef?: React.RefObject<CalendarHandle | null>;
}

export const CalendarReactView: React.FC<CalendarReactViewProps> = ({
  entries,
  weekStartDay,
  initialView,
  scrollToTime,
  properties,
  onViewChange,
  onEntryClick,
  onEntryContextMenu,
  onEventDrop,
  editable,
  calendarHandleRef,
}) => {
  const app = useApp();
  const calendarRef = useRef<FullCalendar>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hoverParentRef = useRef<{ hoverPopover: any }>({ hoverPopover: null });

  useEffect(() => {
    if (calendarHandleRef) {
      (calendarHandleRef as React.RefObject<CalendarHandle | null>).current = {
        updateSize: () => calendarRef.current?.getApi().updateSize(),
      };
    }
    return () => {
      if (calendarHandleRef) {
        (calendarHandleRef as React.RefObject<CalendarHandle | null>).current = null;
      }
    };
  }, [calendarHandleRef]);

  const events = entries.map((calEntry) => {
    // FullCalendar treats allDay end dates as exclusive; add one day to make inclusive.
    let adjustedEndDate = calEntry.endDate;
    if (calEntry.allDay && calEntry.endDate) {
      const startOnly = new Date(
        calEntry.startDate.getFullYear(),
        calEntry.startDate.getMonth(),
        calEntry.startDate.getDate(),
      );
      const endOnly = new Date(
        calEntry.endDate.getFullYear(),
        calEntry.endDate.getMonth(),
        calEntry.endDate.getDate(),
      );
      if (startOnly.getTime() === endOnly.getTime()) {
        adjustedEndDate = undefined;
      } else {
        adjustedEndDate = new Date(calEntry.endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
      }
    }

    return {
      id: calEntry.entry.file.path,
      title: calEntry.entry.file.basename,
      start: calEntry.startDate,
      end: adjustedEndDate,
      allDay: calEntry.allDay,
      backgroundColor: calEntry.backgroundColor,
      borderColor: calEntry.borderColor,
      textColor: calEntry.textColor,
      extendedProps: {
        entry: calEntry.entry,
        originalEndDate: calEntry.endDate,
        allDay: calEntry.allDay,
      },
    };
  });

  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      const target = clickInfo.jsEvent.target as HTMLElement;
      const entry = clickInfo.event.extendedProps.entry as BasesEntry;
      const isModEvent = clickInfo.jsEvent.ctrlKey || clickInfo.jsEvent.metaKey;

      if (target.closest("a.tag")) return;
      if (target.closest(".internal-link")) return;
      const clickedExternal = target.closest("a.external-link") as HTMLAnchorElement | undefined;
      if (clickedExternal?.href) return;

      clickInfo.jsEvent.preventDefault();
      onEntryClick(entry, isModEvent);
    },
    [app, onEntryClick],
  );

  const contextMenuListenersRef = useRef(new WeakMap<HTMLElement, (evt: Event) => void>());

  const handleEventMouseEnter = useCallback(
    (mouseEnterInfo: { event: EventApi; el: HTMLElement; jsEvent: MouseEvent }) => {
      const entry = mouseEnterInfo.event.extendedProps.entry as BasesEntry;
      const el = mouseEnterInfo.el;

      if (app) {
        app.workspace.trigger("hover-link", {
          event: mouseEnterInfo.jsEvent,
          source: "bases",
          hoverParent: hoverParentRef.current,
          targetEl: el,
          linktext: entry.file.path,
        });
      }

      const prevHandler = contextMenuListenersRef.current.get(el);
      if (prevHandler) el.removeEventListener("contextmenu", prevHandler);

      const contextMenuHandler = (evt: Event) => {
        evt.preventDefault();
        const syntheticEvent = {
          nativeEvent: evt as MouseEvent,
          currentTarget: el,
          target: evt.target as HTMLElement,
          preventDefault: () => evt.preventDefault(),
          stopPropagation: () => evt.stopPropagation(),
        } as unknown as React.MouseEvent;
        onEntryContextMenu(syntheticEvent, entry);
      };
      contextMenuListenersRef.current.set(el, contextMenuHandler);
      el.addEventListener("contextmenu", contextMenuHandler);
    },
    [app, onEntryContextMenu],
  );

  const handleEventDrop = useCallback(
    async (dropInfo: EventDropArg) => {
      if (!onEventDrop) {
        dropInfo.revert();
        return;
      }

      const entry = dropInfo.event.extendedProps.entry as BasesEntry;
      const originalEndDate = dropInfo.event.extendedProps.originalEndDate as Date | undefined;
      const allDay = dropInfo.event.extendedProps.allDay as boolean;
      const newStart = dropInfo.event.start;
      const newEnd = dropInfo.event.end;

      if (!newStart) {
        dropInfo.revert();
        return;
      }

      let actualEndDate: Date | undefined;
      if (originalEndDate) {
        if (allDay && newEnd) {
          actualEndDate = new Date(newEnd);
          actualEndDate.setDate(actualEndDate.getDate() - 1);
        } else if (!allDay && newEnd) {
          actualEndDate = new Date(newEnd);
        } else {
          actualEndDate = new Date(newStart);
        }
      }

      try {
        await onEventDrop(entry, newStart, actualEndDate, allDay);
      } catch {
        dropInfo.revert();
      }
    },
    [onEventDrop],
  );

  const hasNonEmptyValue = useCallback((value: Value): boolean => {
    if (!value || !value.isTruthy()) return false;
    const str = value.toString();
    return Boolean(str && str.trim().length > 0);
  }, []);

  // Renders a single property value. For list values with >2 items (e.g. 5-7 people),
  // shows the first 2 items as plain text + a "+N more" badge. For ≤2 items or
  // non-list values, delegates to Obsidian's renderTo for rich formatting (links, chips).
  const CompactPropertyValue: React.FC<{ value: Value; maxItems?: number }> = ({
    value,
    maxItems = 2,
  }) => {
    const raw = value instanceof DateValue ? "" : value.toString();
    // Split on comma separators; handles "Alice, Bob, Carol" and "Alice,Bob"
    const listItems = raw
      ? raw.split(/,\s*|\n/).map((s) => s.trim()).filter(Boolean)
      : [];
    const isLongList = listItems.length > maxItems;

    const richRef = useCallback(
      (node: HTMLElement | null) => {
        if (!node || !app) return;
        while (node.firstChild) node.removeChild(node.firstChild);

        if (value instanceof DateValue) {
          if ("date" in value && value.date && value.date instanceof Date) {
            const opts: Intl.DateTimeFormatOptions =
              "time" in value && (value as { time?: unknown }).time
                ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                : { year: "numeric", month: "short", day: "numeric" };
            node.appendChild(
              document.createTextNode(value.date.toLocaleDateString(undefined, opts)),
            );
          }
          return;
        }

        if (!isLongList) {
          // Few enough items — use Obsidian's renderer for links/chips
          value.renderTo(node, app.renderContext);
        } else {
          // Too many — render first maxItems as plain truncated text
          node.appendChild(
            document.createTextNode(listItems.slice(0, maxItems).join(", ")),
          );
        }
      },
      [value, isLongList],
    );

    return (
      <span className="bases-calendar-prop-list">
        <span ref={richRef} />
        {isLongList && (
          <span className="bases-calendar-prop-overflow">+{listItems.length - maxItems}</span>
        )}
      </span>
    );
  };

  const renderEventContent = useCallback(
    (eventInfo: EventContentArg) => {
      if (!app) return null;

      const entry = eventInfo.event.extendedProps.entry as BasesEntry;
      const validProperties: { propertyId: BasesPropertyId; value: Value }[] = [];
      for (const prop of properties) {
        const value = tryGetValue(entry, prop);
        if (value && hasNonEmptyValue(value)) {
          validProperties.push({ propertyId: prop, value });
        }
      }

      if (validProperties.length > 0) {
        const [first, ...rest] = validProperties;
        return (
          <div className="bases-calendar-event-content">
            <div className="bases-calendar-event-title">
              <CompactPropertyValue value={first.value} />
            </div>
            {rest.length > 0 && (
              <div className="bases-calendar-event-properties">
                {rest.map(({ propertyId: prop, value }) => (
                  <div key={prop} className="bases-calendar-event-property">
                    <span className="bases-calendar-event-property-value">
                      <CompactPropertyValue value={value} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="bases-calendar-event-content">
          <div className="bases-calendar-event-title">{entry.file.basename}</div>
        </div>
      );
    },
    [properties, app, hasNonEmptyValue],
  );

  const handleViewDidMount = useCallback(
    (arg: ViewMountArg) => {
      onViewChange(arg.view.type);
    },
    [onViewChange],
  );

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView={initialView}
      views={{
        dayGridMonth: {},
        timeGridWeek: {},
        workWeek: {
          type: "timeGridWeek",
          weekends: false,
          buttonText: "Work week",
        },
        threeDay: {
          type: "timeGrid",
          duration: { days: 3 },
          buttonText: "3 day",
        },
        timeGridDay: { buttonText: "Today" },
      }}
      firstDay={weekStartDay}
      headerToolbar={{
        left: "title",
        center: "",
        right: "dayGridMonth,timeGridWeek,workWeek,threeDay,timeGridDay prev,today,next",
      }}
      buttonText={{ today: "Today" }}
      nowIndicator={true}
      scrollTime={scrollToTime}
      navLinks={false}
      events={events}
      eventContent={renderEventContent}
      eventClick={handleEventClick}
      eventMouseEnter={handleEventMouseEnter}
      eventDrop={(info) => void handleEventDrop(info)}
      viewDidMount={handleViewDidMount}
      height="auto"
      fixedWeekCount={false}
      fixedMirrorParent={document.body ?? undefined}
      eventDurationEditable={false}
      editable={editable}
    />
  );
};

function tryGetValue(entry: BasesEntry, propId: BasesPropertyId): Value | null {
  try {
    return entry.getValue(propId);
  } catch {
    return null;
  }
}
