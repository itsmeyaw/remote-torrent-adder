type ExtensionApi = typeof chrome;

function resolveExtensionApi(): ExtensionApi {
    const scope = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };
    return (scope.browser ?? scope.chrome) as ExtensionApi;
}

export const ext: ExtensionApi = new Proxy({} as ExtensionApi, {
    get: (_target, property) => Reflect.get(resolveExtensionApi() as object, property),
});
