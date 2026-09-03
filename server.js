const app = require("./api");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`NutriScan running on http://localhost:${PORT}`);
});