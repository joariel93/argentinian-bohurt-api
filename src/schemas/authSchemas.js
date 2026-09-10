const { z } = require('zod');

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido').max(255),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(255),
  }),
});

const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(100),
    password: z.string().min(6).max(255),
    nombre: z.string().min(1).max(100),
    apellido: z.string().min(1).max(100),
    email: z.string().email().max(255).optional().or(z.literal('')),
    telefono: z.string().max(50).optional().or(z.literal('')),
    idTipoUsuario: z.number().int().min(1).max(10),
  }),
});

const updateUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(100).optional(),
    password: z.string().min(6).max(255).optional(),
    nombre: z.string().min(1).max(100).optional(),
    apellido: z.string().min(1).max(100).optional(),
    email: z.string().email().max(255).optional().or(z.literal('')),
    telefono: z.string().max(50).optional().or(z.literal('')),
    idTipoUsuario: z.number().int().min(1).max(10).optional(),
  }),
});

const googleLoginSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'El idToken de Google es requerido'),
  }),
});

module.exports = {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  googleLoginSchema,
};
