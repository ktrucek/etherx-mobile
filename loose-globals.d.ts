declare interface PromiseLike<T> {
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2>;
}

declare interface Promise<T> {
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2>;
    catch<TResult = never>(
        onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T | TResult>;
}

declare interface PromiseConstructor {
    new <T>(
        executor: (
            resolve: (value: T | PromiseLike<T>) => void,
            reject: (reason?: unknown) => void,
        ) => void,
    ): Promise<T>;
    resolve<T>(value: T | PromiseLike<T>): Promise<T>;
    reject<T = never>(reason?: unknown): Promise<T>;
}

declare var Promise: PromiseConstructor;

declare interface JSON {
    parse(text: string): any;
    stringify(value: any): string;
}

declare var JSON: JSON;

declare interface DateConstructor {
    now(): number;
}

declare var Date: DateConstructor;

declare function encodeURIComponent(value: string): string;

declare interface String {
    includes(searchString: string, position?: number): boolean;
    indexOf(searchString: string, position?: number): number;
    match(regexp: RegExp | string): RegExpMatchArray | null;
    trim(): string;
}

declare interface Array<T> {
    [index: number]: T;
    readonly length: number;
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
    filter(
        predicate: (value: T, index: number, array: T[]) => boolean,
        thisArg?: any,
    ): T[];
    find(
        predicate: (value: T, index: number, obj: T[]) => boolean,
        thisArg?: any,
    ): T | undefined;
}

declare interface RegExp {
    test(value: string): boolean;
}

declare interface RegExpMatchArray {
    [index: number]: string;
    readonly length: number;
}