#!/usr/bin/env bash
# Prepara uma VPS Ubuntu 22.04/24.04 nova para receber o EasyPanel (Grupo Lobo).
# NAO foi executado. Rodar como root na NOVA VPS, so depois do IP novo estar liberado no SSW.
# Uso: bash preparar-nova-vps.sh [GB_DE_SWAP]   (padrao: 4)
set -euo pipefail

SWAP_GB="${1:-4}"

echo "== 1. Fuso horario =="
timedatectl set-timezone America/Sao_Paulo

echo "== 2. Atualizacoes basicas =="
apt-get update -y
apt-get install -y curl ca-certificates ufw fail2ban unattended-upgrades

echo "== 3. Swap de ${SWAP_GB} GB =="
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf

echo "== 4. Firewall (SSH, HTTP, HTTPS e painel do EasyPanel) =="
# Ajuste a porta SSH se nao for a 22.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw --force enable

echo "== 5. EasyPanel =="
# Instala Docker e o EasyPanel. Depois abra http://IP_NOVO:3000 e crie o usuario administrador.
curl -sSL https://get.easypanel.io | sh

echo
echo "Pronto. Proximo passo: seguir docs/MIGRACAO-VPS.md, secao 4."
echo "Teste de acesso ao SSW a partir desta VPS:"
echo "  wget -T 10 -S -O /dev/null https://tms.ssw.inf.br/ 2>&1 | head -5"
