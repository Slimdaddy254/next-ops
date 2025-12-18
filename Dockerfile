FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build for production
RUN npm run build

EXPOSE 3000

# Default to development mode (overridden in docker-compose)
CMD ["npm", "run", "dev"]
