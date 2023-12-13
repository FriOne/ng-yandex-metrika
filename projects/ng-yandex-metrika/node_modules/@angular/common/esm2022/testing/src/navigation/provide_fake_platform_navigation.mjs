/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
// @ng_package: ignore-cross-repo-import
import { PlatformNavigation } from '../../../src/navigation/platform_navigation';
import { FakeNavigation } from './fake_navigation';
/**
 * Return a provider for the `FakeNavigation` in place of the real Navigation API.
 *
 * @internal
 */
export function provideFakePlatformNavigation() {
    return [
        {
            provide: PlatformNavigation,
            useFactory: () => {
                return new FakeNavigation(window, 'https://test.com');
            }
        },
    ];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdmlkZV9mYWtlX3BsYXRmb3JtX25hdmlnYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21tb24vdGVzdGluZy9zcmMvbmF2aWdhdGlvbi9wcm92aWRlX2Zha2VfcGxhdGZvcm1fbmF2aWdhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFJSCx3Q0FBd0M7QUFDeEMsT0FBTyxFQUFDLGtCQUFrQixFQUFDLE1BQU0sNkNBQTZDLENBQUM7QUFFL0UsT0FBTyxFQUFDLGNBQWMsRUFBQyxNQUFNLG1CQUFtQixDQUFDO0FBRWpEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsNkJBQTZCO0lBQzNDLE9BQU87UUFDTDtZQUNFLE9BQU8sRUFBRSxrQkFBa0I7WUFDM0IsVUFBVSxFQUFFLEdBQUcsRUFBRTtnQkFDZixPQUFPLElBQUksY0FBYyxDQUFDLE1BQU0sRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3hELENBQUM7U0FDRjtLQUNGLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7UHJvdmlkZXJ9IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xuXG4vLyBAbmdfcGFja2FnZTogaWdub3JlLWNyb3NzLXJlcG8taW1wb3J0XG5pbXBvcnQge1BsYXRmb3JtTmF2aWdhdGlvbn0gZnJvbSAnLi4vLi4vLi4vc3JjL25hdmlnYXRpb24vcGxhdGZvcm1fbmF2aWdhdGlvbic7XG5cbmltcG9ydCB7RmFrZU5hdmlnYXRpb259IGZyb20gJy4vZmFrZV9uYXZpZ2F0aW9uJztcblxuLyoqXG4gKiBSZXR1cm4gYSBwcm92aWRlciBmb3IgdGhlIGBGYWtlTmF2aWdhdGlvbmAgaW4gcGxhY2Ugb2YgdGhlIHJlYWwgTmF2aWdhdGlvbiBBUEkuXG4gKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm92aWRlRmFrZVBsYXRmb3JtTmF2aWdhdGlvbigpOiBQcm92aWRlcltdIHtcbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBwcm92aWRlOiBQbGF0Zm9ybU5hdmlnYXRpb24sXG4gICAgICB1c2VGYWN0b3J5OiAoKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgRmFrZU5hdmlnYXRpb24od2luZG93LCAnaHR0cHM6Ly90ZXN0LmNvbScpO1xuICAgICAgfVxuICAgIH0sXG4gIF07XG59XG4iXX0=