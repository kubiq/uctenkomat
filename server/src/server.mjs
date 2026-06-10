import { createApp } from "./api.mjs";

const PORT = Number(process.env.PORT || 3300);

const app = createApp();
app.listen(PORT, () => {
  console.log(`receipt-api listening on :${PORT}`);
});
