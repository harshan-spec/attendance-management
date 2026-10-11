export const COLLEGE_EMAIL_MESSAGE = "Use your college email address ending in @svce.ac.in to sign up.";

export function isCollegeEmail(email: string): boolean {
  return /^[^\s@]+@svce\.ac\.in$/i.test(email.trim());
}
