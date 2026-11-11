import { describe, expect, it } from 'vitest';
import { CLAVE_SIN_IP, clavePorIp, ipDelCliente } from './ip';

describe('clavePorIp (spec limite-peticiones)', () => {
  it('usa la IPv4 completa', () => {
    expect(clavePorIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it('agrupa por /64 dos direcciones de la misma red IPv6', () => {
    const a = clavePorIp('2800:200:ff80:240::1');
    const b = clavePorIp('2800:200:ff80:240:f4c0:e5c5:1fc:28ff');
    expect(a).toBe('2800:200:ff80:240::/64');
    expect(b).toBe(a);
  });

  it('separa otra red IPv6', () => {
    expect(clavePorIp('2800:200:ff80:241::1')).not.toBe(clavePorIp('2800:200:ff80:240::1'));
  });

  it('normaliza mayúsculas, ceros a la izquierda y la zona', () => {
    expect(clavePorIp('2800:0200:FF80:0240::1%eth0')).toBe('2800:200:ff80:240::/64');
  });

  it('expande "::" al principio y en medio', () => {
    expect(clavePorIp('::1')).toBe('0:0:0:0::/64');
    expect(clavePorIp('2001:db8::')).toBe('2001:db8:0:0::/64');
  });

  it('trata una IPv4 mapeada como IPv4', () => {
    expect(clavePorIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(clavePorIp('::ffff:cb00:7107')).toBe('203.0.113.7');
  });

  it('acepta una IPv4 incrustada que no es mapeada', () => {
    expect(clavePorIp('64:ff9b::203.0.113.7')).toBe('64:ff9b:0:0::/64');
  });

  it('usa la clave compartida si no hay IP', () => {
    expect(clavePorIp(undefined)).toBe(CLAVE_SIN_IP);
    expect(clavePorIp('  ')).toBe(CLAVE_SIN_IP);
  });

  it('no confunde un texto inválido con una IP válida', () => {
    expect(clavePorIp('999.1.1.1')).toBe('otra:999.1.1.1');
    expect(clavePorIp('1:2:3:4:5:6:7:8:9')).toBe('otra:1:2:3:4:5:6:7:8:9');
    expect(clavePorIp('1::2::3')).toBe('otra:1::2::3');
  });
});

describe('ipDelCliente', () => {
  it('lee solo CF-Connecting-IP', () => {
    expect(ipDelCliente({ 'cf-connecting-ip': ' 203.0.113.7 ' })).toBe('203.0.113.7');
    expect(ipDelCliente({ 'x-forwarded-for': '198.51.100.1' })).toBeUndefined();
    expect(ipDelCliente({ 'cf-connecting-ip': ['203.0.113.9', 'x'] })).toBe('203.0.113.9');
  });
});
