export const LOCAL_RUN_ID = /^[a-z0-9-]{1,128}$/;

export function safeRunId(value: string): boolean {
  return LOCAL_RUN_ID.test(value);
}

