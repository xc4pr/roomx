export type Edition = 'free' | 'pro';

export const EDITION: Edition = __ROOMX_EDITION__;
export const IS_FREE: boolean = EDITION === 'free';
export const VERSION: string = __ROOMX_VERSION__;
export const BUILD_DATE: string = __ROOMX_BUILD_DATE__;
