import { Plugin } from "obsidian";
import { CalendarView, CalendarViewType } from "./calendar-view";

export default class BasesCalendarPlugin extends Plugin {
  onload() {
    // Register "bases" as a hover source that doesn't require CMD/CTRL
    // so Page Preview shows on regular hover over calendar events.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).hoverLinkSources["bases"] = {
      display: "Bases Calendar",
      defaultMod: false,
    };

    this.registerBasesView(CalendarViewType, {
      name: "Calendar",
      icon: "lucide-calendar",
      factory: (controller, containerEl) =>
        new CalendarView(controller, containerEl),
      options: () => CalendarView.getViewOptions(),
    });
  }

  onunload() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (this.app.workspace as any).hoverLinkSources["bases"];
  }
}
