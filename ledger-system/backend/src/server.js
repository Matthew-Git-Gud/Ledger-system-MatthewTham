
import "dotenv/config";
import express from "express";
import routes from "./routes/index.js";
import { pool } from "./db/pool.js";

const app = express();

app.use(express.json());

if (process.env.NODE_ENV === "test") {
  app.get("/test/database-identity", async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT DATABASE() AS databaseName"
      );

      res.json({
        environment: process.env.NODE_ENV,
        databaseName: rows[0].databaseName
      });
    } catch (error) {
      console.error("Test database identity error:", error);

      res.status(500).json({
        error: "Unable to verify test database"
      });
    }
  });
}

app.use("/", routes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(
    `Ledger API listening on http://localhost:${PORT}`
  );
});
