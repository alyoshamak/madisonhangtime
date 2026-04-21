const PASSWORD_KEY = "qt:password";
const MEMBER_ID_KEY = "qt:memberId";
const MEMBER_NAME_KEY = "qt:memberName";

export const session = {
  getPassword(): string | null {
    return localStorage.getItem(PASSWORD_KEY);
  },
  setPassword(v: string) {
    localStorage.setItem(PASSWORD_KEY, v);
  },
  clearPassword() {
    localStorage.removeItem(PASSWORD_KEY);
  },
  getMemberId(): string | null {
    return localStorage.getItem(MEMBER_ID_KEY);
  },
  getMemberName(): string | null {
    return localStorage.getItem(MEMBER_NAME_KEY);
  },
  setMember(id: string, name: string) {
    localStorage.setItem(MEMBER_ID_KEY, id);
    localStorage.setItem(MEMBER_NAME_KEY, name);
  },
  clearMember() {
    localStorage.removeItem(MEMBER_ID_KEY);
    localStorage.removeItem(MEMBER_NAME_KEY);
  },
};
