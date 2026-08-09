/* ============================================================
   API SERVICE LAYER
   Re-exports the HTTP client for the feature services and
   documents the REST contract convention.

   Contract convention used by every service function:

     http.get(API_ENDPOINTS.products.list, { params: { page, size } })
     - METHOD:   GET
     - ENDPOINT: /api/v1/products?page=0&size=24
     - REQUEST:  { page:number, size:number, categoryId?:number }
     - RESPONSE (raw): { success, message, data, timestamp }
       data: { content: Product[], page, size, totalElements,
               totalPages, last:boolean }

   Services unwrap the ApiResponse envelope (return `body.data`) so
   pages receive the shape above. The backend wraps every response
   as { success:boolean, message:string, data:T, timestamp:string }.

   Service modules that consume API_ENDPOINTS:
     authService, productService, categoryService, wishlistService,
     cartService. Orders, seller and admin services are still local
     fallbacks and document their future REST contract in their
     header comments.
   ============================================================ */

export { http, ApiError } from "../utils/http.js";
