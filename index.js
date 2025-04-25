import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const dbConfig = {
  user: "postgres",
  host: "localhost",
  password: "ivan",
  port: 5432,
};

async function createDatabaseIfNotExists() {
  const client = new pg.Client({ ...dbConfig, database: "postgres" });
  await client.connect();
  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", ["world"]);
  if (res.rows.length === 0) {
    await client.query("CREATE DATABASE world");
  }
  await client.end();
}

async function startApp() {
  try {
    await createDatabaseIfNotExists();
    const db = new pg.Pool({ ...dbConfig, database: "world" });
    await db.connect();

    await db.query(`
      CREATE TABLE IF NOT EXISTS countries (
        country_code VARCHAR(3) PRIMARY KEY,
        country_name VARCHAR(255)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS visited_countries (
        country_code VARCHAR(3) PRIMARY KEY,
        FOREIGN KEY (country_code) REFERENCES countries(country_code)
      )
    `);

    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(express.static("public"));

    async function checkVisited() {
      const result = await db.query("SELECT country_code FROM visited_countries");
      return result.rows.map(r => r.country_code);
    }

    app.set("view engine", "ejs");
    app.set("views", "./views");

    app.get("/", async (req, res) => {
      const countries = await checkVisited();
      res.render("index.ejs", { total: countries.length, countries });
    });

    app.post("/add", async (req, res) => {
      const country_request = req.body.country.trim();
      let result;
      try {
        result = await db.query(
          "SELECT country_code FROM countries WHERE country_name = $1",
          [country_request]
        );
        if (result.rows.length === 0) throw new Error();
      } catch {
        const countries = await checkVisited();
        return res.render("index.ejs", {
          total: countries.length,
          countries,
          error: "Country does not exist, please try again"
        });
      }

      const code = result.rows[0].country_code;

      try {
        await db.query(
          "INSERT INTO visited_countries (country_code) VALUES ($1)",
          [code]
        );
        res.redirect("/");
      } catch {
        const countries = await checkVisited();
        res.render("index.ejs", {
          error: "The country code already exists in the database",
          total: countries.length,
          countries
        });
      }
    });

    app.listen(port);
  } catch (err) {
    console.error(err);
  }
}

startApp();
