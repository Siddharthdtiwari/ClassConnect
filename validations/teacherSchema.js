const { z } = require('zod');

const createBatchSchema = z.object({
  name: z.string().min(1, "Batch name is required"),
}).passthrough();

const createStudentSchema = z.object({
  studentName: z.string().min(1, "Student name is required"),
  studentId: z.string().min(1, "Student ID is required"),
  batchId: z.string().min(1, "Batch is required"),
  mobileNo: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  monthlyFee: z.union([z.string(), z.number()]).optional(),
}).passthrough();

const createTeacherSchema = z.object({
  teacherName: z.string().min(1, "Teacher name is required"),
  teacherId: z.string().min(1, "Teacher ID is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
}).passthrough();

const createFeeSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  amount: z.union([z.string(), z.number()]),
  month: z.string().min(1, "Month is required"),
  method: z.string().min(1, "Payment method is required"),
}).passthrough();

const saveAttendanceSchema = z.object({
  batch: z.string().min(1, "Batch is required"),
  date: z.string().min(1, "Date is required"),
}).passthrough();

const createTestSchema = z.object({
  batch: z.string().min(1, "Batch is required"),
  testName: z.string().min(1, "Test name is required"),
  testDate: z.string().min(1, "Test date is required"),
  totalMarks: z.union([z.string(), z.number()]),
}).passthrough();

module.exports = {
  createBatchSchema,
  createStudentSchema,
  createTeacherSchema,
  createFeeSchema,
  saveAttendanceSchema,
  createTestSchema
};
