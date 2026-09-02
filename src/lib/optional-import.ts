export function importOptional(id: string): Promise<unknown> {
    return import(id);
}
