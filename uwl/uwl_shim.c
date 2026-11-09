/* Compiles the loader implementation + the V-facing shim. */
#define UWL_IMPLEMENTATION
#include "universal_wasm_loader.h"
#include "uwl_shim.h"

#include <stdlib.h>

/* uwlv_arg -> uwl_val_t. A string (or an error's message) is COPIED (free the
 * result with uwl_val_free); an unknown kind becomes void, which the loader
 * refuses. */
static uwl_val_t uwlv__to_val(const uwlv_arg *a) {
    switch (a->kind) {
        case UWL_ERR:  return uwl_err(a->s);
        case UWL_I32:  return uwl_i32((int32_t)a->i);
        case UWL_I64:  return uwl_i64((int64_t)a->i);
        case UWL_F32:  return uwl_f32((float)a->d);
        case UWL_F64:  return uwl_f64(a->d);
        case UWL_BOOL: return uwl_bool((int)a->i);
        case UWL_STR:  return uwl_str(a->s ? a->s : "");
        default:       return uwl_void();
    }
}

/* uwl_val_t -> uwlv_arg. A string is BORROWED from `v`. */
static uwlv_arg uwlv__from_val(const uwl_val_t *v) {
    uwlv_arg a = { (int)v->kind, 0, 0.0, NULL };
    switch (v->kind) {
        case UWL_I32:  a.i = v->as.i32; break;
        case UWL_I64:  a.i = v->as.i64; break;
        case UWL_F32:  a.d = v->as.f32; break;
        case UWL_F64:  a.d = v->as.f64; break;
        case UWL_BOOL: a.i = v->as.b; break;
        case UWL_STR:  a.s = v->str; break;
        default: break;
    }
    return a;
}

/* The one uwl_host_fn_t for every import: decode, run the V callback, encode.
 * A V error comes back as kind UWL_ERR and becomes uwl_err(msg), which makes
 * the loader trap at the import, void ones included (loader-c 2.1.0, C39);
 * any other kind is checked against the import's WIT result by the loader. */
static uwl_val_t uwlv__trampoline(const uwl_val_t *args, size_t nargs, void *userdata) {
    uwlv_arg stack[8];
    uwlv_arg *a = nargs <= 8 ? stack : (uwlv_arg *)malloc(nargs * sizeof(uwlv_arg));
    if (!a) return uwl_err("out of memory passing the arguments to the V callback");
    for (size_t i = 0; i < nargs; i++) a[i] = uwlv__from_val(&args[i]);
    uwlv_arg out = { UWL_VOID, 0, 0.0, NULL };
    uwlv_host_dispatch(userdata, a, nargs, &out);
    if (a != stack) free(a);
    return uwlv__to_val(&out);
}

uwl_module_t *uwlv_import_with(const char *path, const char *const *names,
                               void *const *ctxs, size_t n, char **err) {
    uwl_host_callback_t *cbs = NULL;
    if (n) {
        cbs = (uwl_host_callback_t *)malloc(n * sizeof(uwl_host_callback_t));
        if (!cbs) { uwl__set_err(err, "out of memory"); return NULL; }
        for (size_t i = 0; i < n; i++) {
            cbs[i].name = names[i];
            cbs[i].fn = uwlv__trampoline;
            cbs[i].userdata = ctxs[i];
        }
    }
    /* The loader copies fn / userdata into its bindings and reads the names
       only during the call, so the array is freed right after. */
    uwl_module_t *m = uwl_import(path, cbs, n, err);
    free(cbs);
    return m;
}

void uwlv_free(uwl_module_t *m) { uwl_free(m); }

void uwlv_free_str(char *s) { uwl_string_free(s); }

int uwlv_call(uwl_module_t *m, const char *name,
              const uwlv_arg *args, size_t n,
              int *out_kind, long long *out_i, double *out_d, char **out_s,
              char **err) {
    uwl_val_t *vals = n ? (uwl_val_t *)malloc(n * sizeof(uwl_val_t)) : NULL;
    if (n && !vals) { uwl__set_err(err, "out of memory"); *out_kind = UWL_VOID; return -1; }
    for (size_t i = 0; i < n; i++) vals[i] = uwlv__to_val(&args[i]);

    uwl_val_t out;
    int rc = uwl_call(m, name, vals, n, &out, err);

    for (size_t i = 0; i < n; i++)
        if (vals[i].kind == UWL_STR) uwl_val_free(&vals[i]);
    free(vals);

    if (rc != 0) { *out_kind = UWL_VOID; return -1; }

    *out_kind = (int)out.kind;
    *out_i = 0; *out_d = 0; *out_s = NULL;
    switch (out.kind) {
        case UWL_I32:  *out_i = uwl_as_i32(out); break;
        case UWL_I64:  *out_i = uwl_as_i64(out); break;
        case UWL_F32:  *out_d = uwl_as_f32(out); break;
        case UWL_F64:  *out_d = uwl_as_f64(out); break;
        case UWL_BOOL: *out_i = uwl_as_bool(out); break;
        case UWL_STR:  *out_s = out.str; out.str = NULL; break; /* transfer ownership */
        default: break;
    }
    uwl_val_free(&out); /* str ownership already transferred when applicable */
    return 0;
}
