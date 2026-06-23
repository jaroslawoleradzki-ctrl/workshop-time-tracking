"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const employees_1 = __importDefault(require("./routes/employees"));
const orders_1 = __importDefault(require("./routes/orders"));
const work_time_types_1 = __importDefault(require("./routes/work-time-types"));
const reports_1 = __importDefault(require("./routes/reports"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const imports_1 = __importDefault(require("./routes/imports"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Request logger for debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// API Routes
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/employees', employees_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/work-time-types', work_time_types_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/imports', imports_1.default);
// Base route for health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Wystąpił wewnętrzny błąd serwera',
    });
});
// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
