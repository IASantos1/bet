import axios from "axios";
import fs from "fs";
import path from "path";
import 'dotenv/config';

const API_URL = "https://v3.football.api-sports.io/countries";

// Use API_SPORTS_KEY if API_FOOTBALL_KEY is not set
const API_KEY = process.env.API_FOOTBALL_KEY || process.env.API_SPORTS_KEY;

if (!API_KEY) {
    console.error("❌ Erro: API_FOOTBALL_KEY (ou API_SPORTS_KEY) não encontrada no .env");
    process.exit(1);
}

const headers = {
  "x-apisports-key": API_KEY
};

async function generateCountries() {
  try {
    console.log(`🔄 Buscando países em ${API_URL}...`);
    const res = await axios.get(API_URL, { headers });

    if (!res.data || !res.data.response) {
        console.error("❌ Erro: Resposta inválida da API", res.data);
        return;
    }

    const countries = res.data.response.map(c => ({
      name: c.name,
      code: c.code,
      flag: c.flag
    }));

    // Ordenar por nome
    countries.sort((a, b) => a.name.localeCompare(b.name));

    // Ensure directory exists
    const outputDir = path.resolve(process.cwd(), "src/data");
    if (!fs.existsSync(outputDir)){
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "countries.json");

    fs.writeFileSync(
      outputPath,
      JSON.stringify(countries, null, 2),
      "utf-8"
    );

    console.log(`🌍 ${countries.length} países salvos em ${outputPath}`);
  } catch (err) {
    console.error("❌ Erro ao gerar países:", err.message);
    if (err.response) {
        console.error("Detalhes:", err.response.data);
    }
  }
}

generateCountries();
