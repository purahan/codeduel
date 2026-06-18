import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "./dynamo";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    // Called after successful sign in
    async signIn({ user }) {
      const userId = user.id!;

      // Check if user already exists in DynamoDB
      const existing = await dynamo.send(
        new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        })
      );

      // First time login — create profile with starting ELO of 1200
      if (!existing.Item) {
        await dynamo.send(
          new PutCommand({
            TableName: TABLE,
            Item: {
              PK: `USER#${userId}`,
              SK: "PROFILE",
              userId,
              username: user.name ?? user.email ?? "anonymous",
              email: user.email,
              avatar: user.image,
              elo: 1200,
              wins: 0,
              losses: 0,
              createdAt: Date.now(),
            },
          })
        );

        // Also write their leaderboard entry
        await dynamo.send(
          new PutCommand({
            TableName: TABLE,
            Item: {
              PK: `USER#${userId}`,
              SK: "LEADERBOARD",
              GSI1PK: "LEADERBOARD#GLOBAL",
              GSI1SK: 1200, // Number — sorts natively in GSI
              userId,
              username: user.name ?? "anonymous",
              avatar: user.image,
            },
          })
        );
      }

      return true;
    },

    // Attach userId to the session so we can use it in API routes
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
  },

  pages: {
    signIn: "/",
  },
};
