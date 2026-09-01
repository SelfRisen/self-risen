-- Records how an account signs in, so a failed sign-in can say which method to
-- use instead of "invalid email or password". Nullable: existing accounts have
-- no value and fall back to the sign-in methods Firebase knows about.
ALTER TABLE "User" ADD COLUMN "authProvider" TEXT;
