// stderr分级输出，不污染stdout
export const logger = {
  info: (msg: string) => console.error(`[info] ${msg}`),
  warn: (msg: string) => console.error(`[warn] ${msg}`),
  error: (msg: string) => console.error(`[error] ${msg}`),
  debug: (msg: string) => {
    if (process.env.DEBUG) {
      console.error(`[debug] ${msg}`);
    }
  },
};
