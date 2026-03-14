class NoopSemanticProvider {
    constructor() {
        this.name = 'noop';
    }

    isAvailable() {
        return false;
    }

    async search() {
        return {
            provider: this.name,
            enabled: false,
            hits: [],
        };
    }
}

export function createSemanticProvider() {
    return new NoopSemanticProvider();
}

export { NoopSemanticProvider };
