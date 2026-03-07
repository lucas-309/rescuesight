import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 8080);
const { app } = buildApp();

app.listen(port, () => {
  console.log(`RescueSight API listening on http://localhost:${port}`);
});
