function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "")
}

function isAbsoluteHttpUrl(value: string): boolean {
    try {
        const url = new URL(value)
        return url.protocol === "http:" || url.protocol === "https:"
    } catch {
        return false
    }
}

export function getSiteOrigin(): string {
    const envUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.SITE_URL ||
        process.env.VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_URL

    if (envUrl) {
        const normalized = envUrl.startsWith("http")
            ? envUrl
            : `https://${envUrl}`
        if (isAbsoluteHttpUrl(normalized)) {
            return trimTrailingSlash(normalized)
        }
    }

    return "http://localhost:6002"
}

export function getSiteUrl(pathname = "/"): string {
    const origin = getSiteOrigin()
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`
    return `${origin}${path}`
}

export function getDrawioOpenUrlBase(): string {
    const explicit =
        process.env.NEXT_PUBLIC_DRAWIO_VIEWER_URL ||
        process.env.NEXT_PUBLIC_DRAWIO_OPEN_URL
    if (explicit && isAbsoluteHttpUrl(explicit)) {
        return trimTrailingSlash(explicit)
    }

    const drawioBase =
        process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || "https://embed.diagrams.net"

    try {
        const url = new URL(drawioBase)
        if (url.hostname === "embed.diagrams.net") {
            return "https://app.diagrams.net"
        }
        return `${url.protocol}//${url.host}`
    } catch {
        return "https://app.diagrams.net"
    }
}
