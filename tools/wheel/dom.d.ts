import type {WheelData} from './index.mjs';
/** Browser-only renderer; import the root entry for DOM-free SVG and model types. */
export function createWheel(data: WheelData, options: { document: Document; title?: string }): HTMLElement;
