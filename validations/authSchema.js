const { z } = require('zod');

const loginSchema = z.object({
  teacherId: z.string().min(1, "Teacher ID is required").max(50),
  password: z.string().min(1, "Password is required").max(100),
});

const studentLoginSchema = z.object({
  studentId: z.string().min(1, "Student ID is required").max(50),
  password: z.string().min(1, "Password is required").max(100),
});

module.exports = {
  loginSchema,
  studentLoginSchema
};
