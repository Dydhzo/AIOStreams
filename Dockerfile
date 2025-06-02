FROM node:22-alpine AS builder

WORKDIR /build

# Copy LICENSE file.
COPY LICENSE ./

# Copy the relevant package.json and package-lock.json files.
COPY package*.json ./
COPY packages/formatters/package*.json ./packages/formatters/
COPY packages/parser/package*.json ./packages/parser/
COPY packages/types/package*.json ./packages/types/
COPY packages/wrappers/package*.json ./packages/wrappers/
COPY packages/addon/package*.json ./packages/addon/
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/utils/package*.json ./packages/utils/

# Install dependencies.
# Install Git as it might be required for some npm packages.
RUN apk add --no-cache git
RUN npm install

# Copy source files.
COPY tsconfig.*json ./

COPY packages/addon ./packages/addon
COPY packages/formatters ./packages/formatters
COPY packages/parser ./packages/parser
COPY packages/types ./packages/types
COPY packages/wrappers ./packages/wrappers
COPY packages/frontend ./packages/frontend
COPY packages/utils ./packages/utils

# Build the project.
RUN npm run build

# Remove development dependencies.
RUN npm --workspaces prune --omit=dev

FROM node:22-alpine AS final

WORKDIR /app

# Copy the built files from the builder.
# The package.json files must be copied as well for NPM workspace symlinks between local packages to work.
COPY --from=builder /build/package*.json /build/LICENSE ./

COPY --from=builder /build/packages/addon/package.*json ./packages/addon/
COPY --from=builder /build/packages/frontend/package.*json ./packages/frontend/
COPY --from=builder /build/packages/formatters/package.*json ./packages/formatters/
COPY --from=builder /build/packages/parser/package.*json ./packages/parser/
COPY --from=builder /build/packages/types/package.*json ./packages/types/
COPY --from=builder /build/packages/wrappers/package.*json ./packages/wrappers/
COPY --from=builder /build/packages/utils/package.*json ./packages/utils/


COPY --from=builder /build/packages/addon/dist ./packages/addon/dist
COPY --from=builder /build/packages/frontend/out ./packages/frontend/out
COPY --from=builder /build/packages/formatters/dist ./packages/formatters/dist
COPY --from=builder /build/packages/parser/dist ./packages/parser/dist
COPY --from=builder /build/packages/types/dist ./packages/types/dist
COPY --from=builder /build/packages/wrappers/dist ./packages/wrappers/dist
COPY --from=builder /build/packages/utils/dist ./packages/utils/dist

COPY --from=builder /build/node_modules ./node_modules

EXPOSE 3000

ENTRYPOINT ["npm", "run", "start:addon"]