import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';

const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
    level: isProduction ? 'info' : 'debug',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: isProduction
        ? [new winston.transports.Console()]
        : [
            new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
            new winston.transports.File({ filename: 'logs/combined.log' }),
            new winston.transports.Console({ format: combine(colorize(), logFormat) }),
        ],
});

export { logger };
