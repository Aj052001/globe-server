require("dotenv").config();
const express = require("express");
const axios = require("axios");
const gs = require("github-scraper");
const mongoose = require("mongoose");
const cors = require("cors");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const app = express();
app.use(cors());
connectDB();

// MongoDB Schema and Model
const githubDataSchema = new mongoose.Schema({
  resident: String,
  revenue: Number, // Total repositories
  detail: String, // First pinned repository
  house: String, // House name
  timestamp: { type: Date, default: Date.now }, // Timestamp for tracking
});

const GithubData = mongoose.model("GithubData", githubDataSchema);

// Helper Functions
function extractUsernameFromUrl(githubUrl) {
  const regex = /^(https?:\/\/)?github\.com\/([a-zA-Z0-9-_]+)/;
  const match = githubUrl.match(regex);
  return match ? match[2] : null;
}

async function scrapeGithub(username) {
  return new Promise((resolve, reject) => {
    gs(username, async (err, data) => {
      if (err) {
        reject({ error: `Error fetching data for user ${username}` });
      } else {
        const repoCount = data.repos || 0;
        const pinnedRepos = data.pinned
          ? data.pinned.map((repo) => repo.url.split("/").pop())
          : [];
        resolve({
          resident: data.name || "Not available",
          revenue: repoCount,
          detail: pinnedRepos[0] || "No pinned repo",
        });
      }
    });
  });
}

async function fetchGithubDataFromUrl() {
  const url =process.env.URL;

  try {
    const response = await axios.get(url);
    return response.data;
  } catch (err) {
    return { error: "Failed to fetch data from the URL" };
  }
}

// Route to Scrape GitHub Profiles and Save Data to MongoDB
app.get("/scrape_multiple_github", async (req, res) => {
  const dataFromUrl = await fetchGithubDataFromUrl();

  if (dataFromUrl.error) {
    return res.status(400).json({ error: dataFromUrl.error });
  }

  const githubData = dataFromUrl.profiles || [];
  const allUserData = [];

  for (const entry of githubData) {
    const githubUrl = entry.github;
    const houseName = entry.location || "Unknown House";

    if (!githubUrl) continue;

    const username = extractUsernameFromUrl(githubUrl);

    if (!username) continue;

    try {
      const userData = await scrapeGithub(username);
      userData.house = houseName;

      // Save the data to MongoDB
      const savedData = await GithubData.create(userData);
      console.log("Saved data to MongoDB:", savedData);

      allUserData.push(savedData);
    } catch (error) {
      allUserData.push({ error: `Failed to scrape data for user: ${username}` });
    }
  }

  res.json({
    message: "Data scraped and saved to MongoDB",
    data: allUserData,
  });
});

// Route to Fetch Data from MongoDB
app.get("/get_saved_data", async (req, res) => {
  try {
    const data = await GithubData.find().sort({ timestamp: -1 }); // Get all saved data
    res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching data from MongoDB:", error);
    res.status(500).json({ success: false, error: "Failed to fetch data" });
  }
});


app.get("/check",(req,res)=>{
  res.send("Done")
})

app.get("/",(req,res)=>{
  res.send("Hello")
})
// Start the server
const port = process.env.PORT || 3005;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
