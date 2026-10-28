import { User } from '../models/User.js';

const defaultUsers = [
  {
    name: 'QA Test User',
    email: 'qa.test.user@example.com',
    password: 'Password123',
    role: 'candidate',
  },
  {
    name: 'Interviewer Demo User',
    email: 'interviewer.demo@example.com',
    password: 'Password123',
    role: 'interviewer',
  },
  {
    name: 'Admin Demo User',
    email: 'admin.demo@example.com',
    password: 'Password123',
    role: 'admin',
  },
];

export const seedDefaultUsers = async () => {
  const normalizedUsers = defaultUsers.map((user) => ({
    ...user,
    email: String(user.email).trim().toLowerCase(),
  }));

  const existingEmails = new Set(
    (await User.find({ email: { $in: normalizedUsers.map((user) => user.email) } }).select('email').lean()).map(
      (user) => String(user.email).toLowerCase()
    )
  );

  const toCreate = normalizedUsers.filter((user) => !existingEmails.has(user.email));

  if (toCreate.length === 0) {
    return;
  }

  for (const user of toCreate) {
    await User.create(user);
  }

  console.log(`[Seed] Created ${toCreate.length} default user(s) for development access.`);
};
