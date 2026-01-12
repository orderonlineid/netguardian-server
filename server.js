/**
 * Simple Website Monitoring Backend
 * Jalankan dengan: node server.js
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

// Database sederhana dalam memori (Ganti dengan MongoDB/Postgres untuk produksi)
let monitoredSites = [
    // { id: '1', name: 'Google', url: 'https://google.com', status: 'PENDING', latency: 0, history: [] },
    { id: '2', name: 'OO - API', url: 'https://api.orderonline.id', status: 'PENDING', latency: 0, history: [] },
    { id: '3', name: 'OO - Official', url: 'https://orderonline.id', status: 'PENDING', latency: 0, history: [] },
];

let eventLogs = [];

// Fungsi untuk mengecek status website
const checkWebsite = async (site) => {
    const start = Date.now();
    // Log
    console.log(`Checking ${site.name} (${site.url})`);
    try {
        await axios.get(site.url, { timeout: 5000 });
        const latency = Date.now() - start;

        // Cek perubahan status
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
    }

    // Update history (simpan 20 data terakhir)
    site.history.push(site.latency);
    if (site.history.length > 20) site.history.shift();

    site.lastChecked = new Date();
};

// Scheduler: Jalankan pengecekan setiap 10 detik
cron.schedule('*/10 * * * * *', async () => {
    console.log('Running health checks...');
    for (let site of monitoredSites) {
        await checkWebsite(site);
    }
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
    // Cek segera setelah ditambah
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
