const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const geoip = require("geoip-lite");
const dns = require("dns").promises;

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// CORS middleware
const setCors = (res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
};

// ============================================
// GEOLOCATION ENDPOINT: POST /api/geolocate
// ============================================
exports.geolocate = functions
  .runWith({
    secrets: [],
  })
  .https.onRequest((req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    (async () => {
      const urls = req.body.urls;
      if (!Array.isArray(urls)) {
        return res
          .status(400)
          .json({ error: "Request body must have a urls array" });
      }

      const results = await Promise.allSettled(
        urls.map(async (url) => {
          let domain, ip, geo, country, city, lat, lng, location;
          try {
            domain = new URL(url).hostname;
            // Add 2-second timeout to DNS lookup to prevent hanging
            const dnsPromise = dns.resolve4(domain);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("DNS timeout")), 2000),
            );
            const ips = await Promise.race([dnsPromise, timeoutPromise]);
            ip = ips[0];
            geo = geoip.lookup(ip);
            country = geo?.country || null;
            city = geo?.city || null;
            lat = geo?.ll?.[0] || null;
            lng = geo?.ll?.[1] || null;
            location = geo?.region || null;
          } catch (e) {
            // fallback if DNS or geo lookup fails
            country = null;
            city = null;
            lat = null;
            lng = null;
            location = null;
            domain = domain || null;
          }
          return {
            domain,
            country,
            city,
            lat,
            lng,
            location,
            count: 1,
          };
        }),
      );
      // Filter out rejected promises
      const settledResults = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      res.json(settledResults);
    })();
  });

// ============================================
// IMAGE SEARCH ENDPOINT: GET /api/images
// (Not used by frontend - searchImagesMultilang is used instead)
// ============================================
/*
exports.searchImages = functions.https.onRequest((req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  (async () => {
    const userQuery = req.query.q || "";
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;

    if (!apiKey || !cx) {
      return res.status(500).json({ error: "Missing Google API credentials" });
    }

    const query = `great wave off kanagawa ${userQuery}`;
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
      query,
    )}&cx=${cx}&searchType=image&key=${apiKey}&num=6`;

    try {
      const response = await axios.get(url);
      const images = response.data.items.map((item) => ({
        link: item.link,
        title: item.title,
      }));

      // Firestore logic: save under words collection (non-blocking)
      const wordRef = db.collection("words").doc(userQuery);
      try {
        await db.runTransaction(async (t) => {
          const doc = await t.get(wordRef);
          if (!doc.exists) {
            t.set(wordRef, { count: 1, images });
          } else {
            const data = doc.data();
            // Merge new images, avoiding duplicates by link
            const existingLinks = new Set(
              (data.images || []).map((img) => img.link),
            );
            const mergedImages = [
              ...(data.images || []),
              ...images.filter((img) => !existingLinks.has(img.link)),
            ];
            t.update(wordRef, {
              count: (data.count || 0) + 1,
              images: mergedImages,
            });
          }
        });
      } catch (fireErr) {
        // Log but don't fail the API call if Firestore has issues
        console.error("Firestore error:", fireErr);
      }

      res.json(images);
    } catch (error) {
      if (error.response) {
        console.error(
          "Google API error:",
          error.response.status,
          error.response.data,
        );
      } else {
        console.error("Google API error:", error.message);
      }
      res.status(500).json({ error: "Failed to fetch images" });
    }
  })();
});
*/

// ============================================
// MULTILINGUAL IMAGE SEARCH: GET /api/images/multilang
// ============================================
exports.searchImagesMultilang = functions
  .runWith({
    secrets: ["GOOGLE_API_KEY", "GOOGLE_CX"],
    memory: "512MB",
    timeoutSeconds: 60,
  })
  .https.onRequest((req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    (async () => {
      const userQuery = req.query.q || "";
      const apiKey = process.env.GOOGLE_API_KEY;
      const cx = process.env.GOOGLE_CX;

      if (!apiKey || !cx) {
        console.error(
          "Missing secrets - GOOGLE_API_KEY:",
          !!apiKey,
          "GOOGLE_CX:",
          !!cx,
        );
        return res
          .status(500)
          .json({ error: "Missing Google API credentials" });
      }

      // Top 5 most relevant languages for "Great Wave" artwork
      // (Free Google CSE limited to 100 queries/day = 20 searches if using 5 languages)
      const languages = [
        {
          code: "en",
          label: "English",
          translation: "Great Wave off Kanagawa",
        },
        { code: "zh", label: "Chinese", translation: "神奈川沖浪裏" },
        { code: "ja", label: "Japanese", translation: "神奈川沖浪裏" },
        {
          code: "es",
          label: "Spanish",
          translation: "La gran ola de Kanagawa",
        },
        {
          code: "fr",
          label: "French",
          translation: "La Grande Vague de Kanagawa",
        },
      ];

      try {
        const results = await Promise.all(
          languages.map(async (lang) => {
            const query = `${lang.translation} ${userQuery}`.trim();
            const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
              query,
            )}&cx=${cx}&searchType=image&key=${apiKey}&num=1`;

            try {
              const response = await axios.get(url);
              const items = response.data.items;

              if (items && items.length > 0) {
                return {
                  language: lang.label,
                  languageCode: lang.code,
                  query: query,
                  image: {
                    link: items[0].link,
                    title: items[0].title,
                    thumbnail: items[0].image?.thumbnailLink || null,
                  },
                };
              } else {
                return {
                  language: lang.label,
                  languageCode: lang.code,
                  query: query,
                  image: null,
                };
              }
            } catch (error) {
              console.error(
                `Error fetching images for ${lang.label}:`,
                error.message,
              );
              return {
                language: lang.label,
                languageCode: lang.code,
                query: query,
                image: null,
              };
            }
          }),
        );

        res.json(results);
      } catch (error) {
        console.error("Multilang API error:", error.message);
        res.status(500).json({ error: "Failed to fetch multilingual images" });
      }
    })();
  });

// ============================================
// FIRESTORE ENDPOINTS - Word tracking
// ============================================

// GET all words from collection - Fixed async/await issue
exports.getWords = functions.https.onRequest(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const snapshot = await db.collection("words").get();
    const words = snapshot.docs.map((doc) => ({
      id: doc.id,
      count: doc.data().count,
    }));
    res.json(words);
  } catch (error) {
    console.error("Error fetching words:", error.message);
    res.status(500).json({ error: "Failed to fetch words" });
  }
});

// GET trending words - Fixed async/await issue
exports.getTrendingWords = functions.https.onRequest(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const n = parseInt(req.query.n) || 5;
    const snapshot = await db
      .collection("words")
      .orderBy("count", "desc")
      .limit(n)
      .get();

    const trendingWords = snapshot.docs.map((doc) => ({
      id: doc.id,
      count: doc.data().count,
    }));
    res.json(trendingWords);
  } catch (error) {
    console.error("Error fetching trending words:", error.message);
    res.status(500).json({ error: "Failed to fetch trending words" });
  }
});

// POST to update word count - Fixed async/await issue
exports.updateWord = functions.https.onRequest(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { word } = req.body;
    if (!word) {
      return res.status(400).json({ error: "Missing word parameter" });
    }

    const wordLower = word.toLowerCase();
    const wordRef = db.collection("words").doc(wordLower);

    await db.runTransaction(async (t) => {
      const doc = await t.get(wordRef);
      if (!doc.exists) {
        t.set(wordRef, { count: 1 });
      } else {
        t.update(wordRef, { count: doc.data().count + 1 });
      }
    });

    res.json({ success: true, word: wordLower });
  } catch (error) {
    console.error("Error updating word:", error.message);
    res.status(500).json({ error: "Failed to update word" });
  }
});
