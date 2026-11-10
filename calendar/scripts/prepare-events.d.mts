export interface PrepareEventsOptions {
  readonly check?: boolean;
  readonly cacheDirectory?: string;
}
export function prepareEvents(options?: PrepareEventsOptions): Promise<Readonly<{
  cacheDirectory: string;
  commit: string;
  engineTree: string;
}>>;
