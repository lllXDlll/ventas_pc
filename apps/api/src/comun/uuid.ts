/** Un id de ruta con forma de UUID; los demás se responden 404 sin consultar la base. */
export const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
