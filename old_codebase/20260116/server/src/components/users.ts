/**
 * Users Component
 * Manages user accounts and balances
 */

import type { User } from "../types";

export class UsersComponent {
  private users: User[] = [];

  constructor(initialUsers: User[] = []) {
    this.users = initialUsers;
  }

  /**
   * Get user by ID
   */
  getUser(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }

  /**
   * Get user by email
   */
  getUserByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === email);
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return [...this.users];
  }

  /**
   * Add a new user
   */
  addUser(user: User): void {
    const existing = this.users.find(u => u.id === user.id || u.email === user.email);
    if (existing) {
      console.warn(`⚠️  User ${user.id} or ${user.email} already exists`);
      return;
    }
    this.users.push(user);
  }

  /**
   * Update user balance
   */
  updateUserBalance(userId: string, balance: number): boolean {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.balance = balance;
      return true;
    }
    return false;
  }

  /**
   * Remove user
   */
  removeUser(userId: string): boolean {
    const index = this.users.findIndex(u => u.id === userId);
    if (index > -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }
}

