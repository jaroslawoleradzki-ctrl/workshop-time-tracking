"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt = __importStar(require("bcryptjs"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_1.authenticateJWT);
router.use((0, auth_1.requireRole)(['admin']));
// List all users
router.get('/', async (req, res) => {
    try {
        const users = await prisma_1.default.user.findMany({
            orderBy: { username: 'asc' },
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return res.json(users);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania użytkowników' });
    }
});
// Create new user
router.post('/', async (req, res) => {
    const { username, password, fullName, role } = req.body;
    if (!username || !password || !fullName || !role) {
        return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
    }
    if (role !== 'admin' && role !== 'leader') {
        return res.status(400).json({ message: 'Nieprawidłowa rola' });
    }
    try {
        const existing = await prisma_1.default.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ message: 'Użytkownik o podanym loginie już istnieje' });
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const user = await prisma_1.default.user.create({
            data: {
                username,
                passwordHash,
                fullName,
                role,
                isActive: true,
            },
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
                isActive: true,
            },
        });
        return res.status(201).json(user);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas tworzenia użytkownika' });
    }
});
// Update user details
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { fullName, role, isActive } = req.body;
    if (!fullName || !role || isActive === undefined) {
        return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
    }
    if (role !== 'admin' && role !== 'leader') {
        return res.status(400).json({ message: 'Nieprawidłowa rola' });
    }
    // Prevent self-deactivation or self-demotion
    if (req.user?.id === id && (isActive === false || role !== 'admin')) {
        return res.status(400).json({ message: 'Nie możesz dezaktywować ani zmienić roli własnego konta' });
    }
    try {
        const updated = await prisma_1.default.user.update({
            where: { id },
            data: {
                fullName,
                role,
                isActive,
            },
            select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
                isActive: true,
            },
        });
        return res.json(updated);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas aktualizacji użytkownika' });
    }
});
// Reset password
router.put('/:id/reset-password', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ message: 'Nowe hasło jest wymagane' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        await prisma_1.default.user.update({
            where: { id },
            data: { passwordHash },
        });
        return res.json({ message: 'Hasło zostało zresetowane pomyślnie' });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas resetowania hasła' });
    }
});
exports.default = router;
