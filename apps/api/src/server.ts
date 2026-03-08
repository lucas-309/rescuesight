import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const { app } = buildApp();

app.listen(port, host, () => {
  console.log(`RescueSight API listening on http://${host}:${port}`);
});
