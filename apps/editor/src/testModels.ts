import { InspectorState } from "./main.ts";
import type { Model } from "./main.ts";

export const expanded: Model = { inspector: InspectorState.Expanded() };

export const collapsed: Model = { inspector: InspectorState.Collapsed() };
