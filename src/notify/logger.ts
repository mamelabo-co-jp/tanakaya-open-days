/**
 * 配信処理のログ。1行1件の JSON で標準出力に出す（CloudWatch Logs で検索しやすくするため）。
 * トークン、Authorization ヘッダー、案内の文面は渡さない（要件 7.1）。
 */
export type LogFields = Record<string, string | number | boolean>;

export type Logger = {
  info: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

/** console に出すロガー */
export const createConsoleLogger = (): Logger => ({
  info: (message, fields = {}) => {
    console.log(JSON.stringify({ level: "info", message, ...fields }));
  },
  error: (message, fields = {}) => {
    console.error(JSON.stringify({ level: "error", message, ...fields }));
  },
});
