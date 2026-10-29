import { Lock, ShieldAlert } from "lucide-react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";

type Props = {
  /** Nome do módulo bloqueado (ex.: "Faturamento"). */
  modulo: string;
  onClose: () => void;
  /** Texto do botão principal. */
  rotuloFechar?: string;
  /** Quando o usuário não tem nenhum módulo liberado, o único caminho é sair da conta (substitui o botão de fechar). */
  aoSair?: () => void;
};

/** Aviso de módulo sem permissão. É um diálogo do próprio sistema (não usa alert/confirm do navegador). */
export function AcessoNegadoDialog({ modulo, onClose, rotuloFechar = "Entendi", aoSair }: Props) {
  return (
    <Dialog open label={`Acesso negado ao módulo ${modulo}`} onClose={onClose} className="max-w-md">
      <div className="flex flex-col items-center gap-4 bg-white px-6 pb-6 pt-8 text-center" role="alertdialog" aria-describedby="acesso-negado-texto">
        <span className="relative flex size-16 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
          <ShieldAlert className="size-8" aria-hidden="true" />
          <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-white ring-2 ring-white">
            <Lock className="size-3.5 text-brand-border" aria-hidden="true" />
          </span>
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold">Acesso negado</h2>
          <p id="acesso-negado-texto" className="text-sm text-brand-border">
            Seu perfil não tem permissão para acessar o módulo <strong className="text-brand-dark">{modulo}</strong>. Se precisar dele, peça a liberação ao administrador do sistema.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {aoSair ? <Button onClick={aoSair}>Sair</Button> : <Button onClick={onClose}>{rotuloFechar}</Button>}
        </div>
      </div>
    </Dialog>
  );
}
