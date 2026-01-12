/**
 * Simple Website Monitoring Backend
 * Run with: node server.js
 */

const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');

const app = express();

// Get port from environment or default to 3001
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Simple in-memory database (Change to MongoDB/Postgres for production)
let monitoredSites = [
    // { id: '1', name: 'Google', url: 'https://google.com', status: 'PENDING', latency: 0, history: [] },
    // { id: '2', name: 'OO - API', url: 'https://api.orderonline.id', status: 'PENDING', latency: 0, history: [], recovery_plans: [] },
    { id: '3', name: 'OO - Official', url: 'https://orderonline.id', status: 'PENDING', latency: 0, history: [], recovery_plans: ['clear_cache'] },
];

let eventLogs = [];

// Clear Cloudflare cache function
const clearCloudflareCache = async ({ urls: []}) => {
    try {
        const zoneId = process.env.CLOUDFLARE_ZONE_ID;
        const apiKey = process.env.CLOUDFLARE_API_KEY;
        const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;

        const headers = {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        };

        const response = await axios.post(endpoint,
            { files: urls },
            { headers: headers }
        );
        console.log("Cloudflare cache cleared successfully.");
    } catch (error) {
        console.error("Error clearing Cloudflare cache:", error.message);
    }
};

// Function to check website status
const checkWebsite = async (site) => {
    const start = Date.now();
    // Log
    console.log(`Checking ${site.name} (${site.url})`);
    try {
        await axios.get(site.url, { timeout: 5000 });
        const latency = Date.now() - start;

        // Check status change
        if (site.status === 'DOWN') {
            eventLogs.unshift({
                id: Date.now().toString(),
                websiteId: site.id,
                name: site.name,
                status: 'UP',
                timestamp: new Date(),
                message: 'Service recovered'
            });
        }

        site.status = 'UP';
        site.latency = latency;

        // Log latency
        console.log(`Status: UP, Latency: ${latency}ms`);

    } catch (error) {
        if (site.status === 'UP' || site.status === 'PENDING') {
            eventLogs.unshift({
                id: Date.now().toString(),
                websiteId: site.id,
                name: site.name,
                status: 'DOWN',
                timestamp: new Date(),
                message: error.message || 'Connection Error'
            });
        }
        site.status = 'DOWN';
        site.latency = 0;

        // Log error
        console.log(`Status: DOWN, Error: ${error.message}`);

        // Execute recovery plans if any
        if (site.recovery_plans && site.recovery_plans.length > 0) {
            if (site.recovery_plans.includes('clear_cache')) {
                console.log(`Executing recovery plan: clear_cache for ${site.name}`);
                await clearCloudflareCache({ urls: [site.url] });
            }
        }
    }

    // Update history (max 20 entries)
    site.history.push(site.latency);

    const maxEntries = 20;
    if (site.history.length > maxEntries) site.history.shift();

    site.lastChecked = new Date();
};

// Scheduler: Check all websites every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
    console.log('Running health checks...');
    for (let site of monitoredSites) {
        await checkWebsite(site);
    }
});

// Endpoints
app.get('/', (req, res) => {
    res.send('Website Monitoring Server is running.');
});

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json(monitoredSites);
});

app.get('/api/logs', (req, res) => {
    res.json(eventLogs.slice(0, 50));
});

app.post('/api/sites', (req, res) => {
    const { name, url } = req.body;
    const newSite = {
        id: Date.now().toString(),
        name,
        url,
        status: 'PENDING',
        latency: 0,
        history: [],
        lastChecked: null
    };
    monitoredSites.push(newSite);
    // Initial check
    checkWebsite(newSite);
    res.status(201).json(newSite);
});

app.delete('/api/sites/:id', (req, res) => {
    monitoredSites = monitoredSites.filter(s => s.id !== req.params.id);
    res.json({ message: 'Deleted' });
});

app.listen(PORT, () => {
    console.log(`Monitoring Server running on http://localhost:${PORT}`);
});
