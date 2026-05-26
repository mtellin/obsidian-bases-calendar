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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CalendarEntry } from "./calendar-view";
import { useApp } from "./hooks";

const ZOOM_LEVELS = ["01:00:00", "00:30:00", "00:15:00"] as const;

export interface CalendarHandle {
  updateSize(): void;
}

interface CalendarReactViewProps {
  entries: CalendarEntry[];
  weekStartDay: number;
  initialView: string;
  initialSlotDuration: string;
  scrollToTime: string;
  detailProperty: BasesPropertyId | null;
  properties: BasesPropertyId[];
  onViewChange: (view: string) => void;
  onZoomChange: (slotDuration: string) => void;
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
  initialSlotDuration,
  scrollToTime,
  detailProperty,
  properties,
  onViewChange,
  onZoomChange,
  onEntryClick,
  onEntryContextMenu,
  onEventDrop,
  editable,
  calendarHandleRef,
}) => {
  const app = useApp();
  const calendarRef = useRef<FullCalendar>(null);
  const [slotDuration, setSlotDuration] = useState(initialSlotDuration);
  const slotDurationRef = useRef(initialSlotDuration);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hoverParentRef = useRef<{ hoverPopover: any }>({ hoverPopover: null });

  const handleZoom = useCallback(
    (direction: "in" | "out") => {
      const currentIdx = ZOOM_LEVELS.indexOf(slotDurationRef.current as typeof ZOOM_LEVELS[number]);
      const nextIdx = direction === "in"
        ? Math.min(currentIdx + 1, ZOOM_LEVELS.length - 1)
        : Math.max(currentIdx - 1, 0);
      const next = ZOOM_LEVELS[nextIdx];
      slotDurationRef.current = next;
      setSlotDuration(next);
      onZoomChange(next);
    },
    [onZoomChange],
  );

  const customButtons = useMemo(
    () => ({
      zoomIn:  { text: "+", hint: "Zoom in",  click: () => handleZoom("in") },
      zoomOut: { text: "−", hint: "Zoom out", click: () => handleZoom("out") },
    }),
    [handleZoom],
  );

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

  // Renders a property value with list-aware truncation.
  // Uses Obsidian's renderTo for rich DOM output, then counts the actual child nodes
  // (individual chips/links) to decide truncation — more reliable than string splitting
  // since we don't know the exact separator Obsidian uses for multi-select values.
  const ListPropertyValue: React.FC<{ value: Value; maxItems?: number }> = ({
    value,
    maxItems = 2,
  }) => {
    const nodeRef = useCallback(
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

        // Render into a detached temp element so we can inspect the output.
        const temp = document.createElement("span");
        value.renderTo(temp, app.renderContext);
        const children = Array.from(temp.childNodes);

        // If Obsidian emitted a single text node, try splitting it by commas to
        // get a meaningful item count (handles "Alice, Bob, Carol" flat strings).
        let effectiveCount = children.length;
        let splitItems: string[] | null = null;
        if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
          const parts = (children[0].textContent ?? "")
            .split(/,\s*/)
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (parts.length > 1) {
            effectiveCount = parts.length;
            splitItems = parts;
          }
        }

        if (effectiveCount <= maxItems) {
          // Few items — move rendered children directly into the target node.
          while (temp.firstChild) node.appendChild(temp.firstChild);
        } else if (splitItems) {
          // Was a single text node that we split — render truncated plain text.
          node.appendChild(
            document.createTextNode(splitItems.slice(0, maxItems).join(", ")),
          );
          const badge = document.createElement("span");
          badge.className = "bases-calendar-prop-overflow";
          badge.textContent = `+${effectiveCount - maxItems}`;
          node.appendChild(badge);
        } else {
          // Multiple child nodes (chips/links) — move first maxItems, then badge.
          children.slice(0, maxItems).forEach((child) => node.appendChild(child));
          const badge = document.createElement("span");
          badge.className = "bases-calendar-prop-overflow";
          badge.textContent = `+${effectiveCount - maxItems}`;
          node.appendChild(badge);
        }
      },
      [value],
    );
    return <span className="bases-calendar-prop-list" ref={nodeRef} />;
  };

  const renderEventContent = useCallback(
    (eventInfo: EventContentArg) => {
      if (!app) return null;

      const entry = eventInfo.event.extendedProps.entry as BasesEntry;

      // Skip detail row for short timed events (≤20 min) to avoid overflow.
      const { start, end, allDay } = eventInfo.event;
      const isShortTimed =
        !allDay &&
        start !== null &&
        end !== null &&
        end.getTime() - start.getTime() <= 20 * 60 * 1000;

      // Title: first valid property from order (or file basename fallback).
      const validProperties: { propertyId: BasesPropertyId; value: Value }[] = [];
      for (const prop of properties) {
        const value = tryGetValue(entry, prop);
        if (value && hasNonEmptyValue(value)) {
          validProperties.push({ propertyId: prop, value });
        }
      }
      const titleProp = validProperties[0];

      // Detail line: use detailProperty if configured, otherwise remaining order props.
      let detailNode: React.ReactNode = null;
      if (isShortTimed) {
        detailNode = null;
      } else if (detailProperty) {
        const detailValue = tryGetValue(entry, detailProperty);
        if (detailValue && hasNonEmptyValue(detailValue)) {
          detailNode = (
            <div className="bases-calendar-event-property">
              <span className="bases-calendar-event-property-value">
                <ListPropertyValue value={detailValue} />
              </span>
            </div>
          );
        }
      } else {
        const restProps = validProperties.slice(1);
        if (restProps.length > 0) {
          detailNode = (
            <>
              {restProps.map(({ propertyId: prop, value }) => (
                <div key={prop} className="bases-calendar-event-property">
                  <span className="bases-calendar-event-property-value">
                    <ListPropertyValue value={value} />
                  </span>
                </div>
              ))}
            </>
          );
        }
      }

      return (
        <div className="bases-calendar-event-content">
          <div className="bases-calendar-event-title">
            {titleProp
              ? <ListPropertyValue value={titleProp.value} maxItems={1} />
              : entry.file.basename}
          </div>
          {detailNode && (
            <div className="bases-calendar-event-properties">{detailNode}</div>
          )}
        </div>
      );
    },
    [properties, detailProperty, app, hasNonEmptyValue],
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
        // Month auto-sizes to show all week rows (no inner scroll needed).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dayGridMonth: { contentHeight: "auto" } as any,
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
        right: "dayGridMonth,timeGridWeek,workWeek,threeDay,timeGridDay prev,today,next zoomOut,zoomIn",
      }}
      customButtons={customButtons}
      buttonText={{ today: "Today" }}
      nowIndicator={true}
      scrollTime={scrollToTime}
      slotDuration={slotDuration}
      eventMinHeight={20}
      navLinks={false}
      events={events}
      eventContent={renderEventContent}
      eventClick={handleEventClick}
      eventMouseEnter={handleEventMouseEnter}
      eventDrop={(info) => void handleEventDrop(info)}
      viewDidMount={handleViewDidMount}
      height="100%"
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
