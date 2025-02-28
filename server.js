require('dotenv').config();
const app = require('./app');
const PORT = process.env.PORT || 8058;

const startServer = async () => {
    try {
        const server = app.listen(PORT, () => {
            console.log(`Server is running at http://localhost:${PORT}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use. Please try a different port.`);
                process.exit(1);
            } else {
                console.error('Server error:', err);
                process.exit(1);
            }
        });

        process.on('SIGTERM', () => {
            console.info('SIGTERM signal received. Closing server...');
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer().catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
}); 