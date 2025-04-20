// main.js
import { App } from './src/app/App.js';

try {
    const app = new App('viewerCanvas');
    app.init();
} catch (error) {
    console.error("Failed to initialize the application:", error);
    const errorDiv = document.createElement('div');
    errorDiv.textContent = `Error initializing application: ${error.message}`;
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '10px';
    document.body.prepend(errorDiv);
    const canvas = document.getElementById('viewerCanvas');
    if (canvas) canvas.style.display = 'none';
}