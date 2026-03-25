const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

// ================= MANIFEST =================
const manifest = {
    id: "org.qeseh.addon",
    version: "1.0.0",
    name: "Qeseh Addon",
    description: "Streaming from qeseh.net",
    resources: ["catalog", "stream", "meta"],
    types: ["movie"],
    catalogs: [
        { type: "movie", id: "qeseh_movies", name: "Qeseh Movies" }
    ]
};

const builder = new addonBuilder(manifest);

// ================= SCRAPER =================

// جلب قائمة الأفلام
async function getMovies() {
    try {
        const { data } = await axios.get("https://qeseh.net/");
        const $ = cheerio.load(data);

        const movies = [];

        $(".movie-item").each((i, el) => {
            const name = $(el).find(".title").text().trim();
            const link = $(el).find("a").attr("href");
            const poster = $(el).find("img").attr("src");

            if (name && link) {
                movies.push({
                    id: link,
                    type: "movie",
                    name,
                    poster
                });
            }
        });

        return movies;
    } catch (err) {
        console.log("Error scraping:", err.message);
        return [];
    }
}

// جلب رابط المشاهدة
async function getStreams(url) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const iframe = $("iframe").attr("src");

        if (!iframe) return [];

        return [{
            title: "Qeseh Stream",
            url: iframe
        }];
    } catch (err) {
        console.log("Stream error:", err.message);
        return [];
    }
}

// ================= HANDLERS =================

// catalog
builder.defineCatalogHandler(async () => {
    const metas = await getMovies();
    return { metas };
});

// stream
builder.defineStreamHandler(async (args) => {
    const streams = await getStreams(args.id);
    return { streams };
});

// ================= SERVERLESS =================
module.exports = (req, res) => {
    const addonInterface = builder.getInterface();
    addonInterface(req, res);
};
