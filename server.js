const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the current directory
app.use(express.static(__dirname));

// Explicitly serve the images directory
app.use('/images', express.static(path.join(__dirname, 'images')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const port = 3002;
app.listen(port, () => {
    console.log(`Museum server running at http://localhost:${port}`);
    console.log(`Images are served from: ${path.join(__dirname, 'images')}`);
}); 