import assert from "node:assert/strict";
import { test } from "node:test";
import { avanceDePedido } from "../lib/pedidos/pasos";

test("un borrador no tiene línea de pasos", () => assert.equal(avanceDePedido("borrador", "recoger", []), null));

test("los pasos dependen de la entrega: con envío hay «Pendiente de envío» antes de «Enviado»", () => {
  assert.deepEqual(avanceDePedido("pagado", "envio", [])!.pasos.slice(3), ["Pendiente de envío", "Enviado", "Entregado"]);
  assert.deepEqual(avanceDePedido("pagado", "recoger", [])!.pasos.slice(3), ["Listo para recoger", "Entregado"]);
});

test("cada estado cae en su paso", () => {
  const envio: [Parameters<typeof avanceDePedido>[0], number][] = [["pendiente_pago", 0], ["en_revision", 0], ["pagado", 1], ["preparando", 2], ["pendiente_envio", 3], ["enviado", 4]];
  for (const [e, n] of envio) assert.equal(avanceDePedido(e, "envio", [])!.actual, n, e);
  assert.equal(avanceDePedido("listo_para_recoger", "recoger", [])!.actual, 3);
});

test("entregado deja todos los pasos cumplidos", () => {
  for (const entrega of ["envio", "recoger"] as const) {
    const a = avanceDePedido("entregado", entrega, [])!;
    assert.equal(a.actual, a.pasos.length);
    assert.equal(a.detenido, false);
  }
  // Cancelado después de entregarse... no pasa, pero el historial con «entregado» cae en el último paso de su línea.
  assert.equal(avanceDePedido("cancelado", "recoger", ["entregado"])!.actual, 4);
});

test("cancelado o vencido se detiene en el último paso alcanzado", () => {
  assert.deepEqual(avanceDePedido("vencido", "envio", ["pendiente_pago"]), { pasos: avanceDePedido("vencido", "envio", [])!.pasos, actual: 0, detenido: true });
  assert.equal(avanceDePedido("cancelado", "envio", ["pendiente_pago", "en_revision", "pagado", "preparando"])!.actual, 2);
  assert.equal(avanceDePedido("cancelado", "envio", [])!.actual, 0);
});
