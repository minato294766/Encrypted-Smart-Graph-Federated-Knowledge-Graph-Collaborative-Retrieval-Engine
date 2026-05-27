"use client";

import { useRef, useState } from "react";
import { authLogin, authRegister } from "@/app/lib/client/auth-adapter";

interface LoginFormProps {
  onSignIn: (isAdmin: boolean, account: string) => void;
}

interface PasswordToggleButtonProps {
  visible: boolean;
  onToggle: () => void;
}

function PasswordToggleButton({ visible, onToggle }: PasswordToggleButtonProps) {
  return (
    <button
      type="button"
      className="svg-toggle-pwd"
      onClick={onToggle}
      aria-label={visible ? "隐藏密码" : "显示密码"}
      title={visible ? "隐藏密码" : "显示密码"}
    >
      <span className="svg-eye-icon" aria-hidden="true">
        <svg className="svg-eye-icon-svg" viewBox="0 0 24 24" fill="none" focusable="false">
          <path d="M1.5 12C3.84 7.78 7.56 5.67 12 5.67C16.44 5.67 20.16 7.78 22.5 12C20.16 16.22 16.44 18.33 12 18.33C7.56 18.33 3.84 16.22 1.5 12Z" />
          <circle cx="12" cy="12" r="3.1" />
          <line
            x1="4.2"
            y1="19.3"
            x2="19.8"
            y2="4.7"
            className={visible ? "svg-eye-icon-slash is-hidden" : "svg-eye-icon-slash"}
          />
        </svg>
      </span>
    </button>
  );
}

export function LoginForm({ onSignIn }: LoginFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [activeMode, setActiveMode] = useState<"login" | "register">("login");

  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [registerAccount, setRegisterAccount] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [isApplyingRegister, setIsApplyingRegister] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  const [showPwd, setShowPwd] = useState(false);
  const [showRegisterPwd, setShowRegisterPwd] = useState(false);
  const [showRegisterConfirmPwd, setShowRegisterConfirmPwd] = useState(false);

  const handleSwitchToRegister = () => {
    setActiveMode("register");
    setLoginError("");
    setShowPwd(false);
  };

  const handleBackToLogin = () => {
    setActiveMode("login");
    setRegisterError("");
    setRegisterSuccess(false);
    setIsApplyingRegister(false);
    setShowRegisterPwd(false);
    setShowRegisterConfirmPwd(false);
    setRegisterAccount("");
    setRegisterPassword("");
    setRegisterConfirmPassword("");
  };

  const handleLogin = async () => {
    const account = loginAccount.trim();
    const password = loginPassword;
    if (!account) { setLoginError("请输入账号"); return; }
    if (!password) { setLoginError("请输入密码"); return; }

    setLoginError("");
    setIsLoggingIn(true);
    try {
      const result = await authLogin({ account, password });
      if (result.ok) {
        onSignIn(result.isAdmin, account);
      } else {
        setLoginError(result.errorMessage ?? "登录失败");
      }
    } catch {
      setLoginError("网络错误，请重试");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleApplyRegister = async () => {
    const account = registerAccount.trim();
    const password = registerPassword;
    const confirm = registerConfirmPassword;
    if (!account) { setRegisterError("请输入账号"); return; }
    if (!password) { setRegisterError("请输入密码"); return; }
    if (password !== confirm) { setRegisterError("两次输入的密码不一致"); return; }

    setRegisterError("");
    setIsApplyingRegister(true);
    try {
      const result = await authRegister({ account, password });
      if (result.ok) {
        setRegisterSuccess(true);
      } else {
        setRegisterError(result.errorMessage ?? "申请失败，请重试");
        setIsApplyingRegister(false);
      }
    } catch {
      setRegisterError("网络错误，请重试");
      setIsApplyingRegister(false);
    }
  };

  return (
    <form ref={formRef} className="svg-login-form" autoComplete="off" onClick={(e) => e.stopPropagation()}>
      <div className="svg-form-switcher">
        <section className={`svg-form-panel ${activeMode === "register" ? "is-active" : "is-inactive"}`}>
          <div className="svg-field">
            <input
              type="text"
              placeholder=" "
              id="sv-register-account"
              autoComplete="off"
              value={registerAccount}
              onChange={(e) => setRegisterAccount(e.target.value)}
              required
            />
            <label htmlFor="sv-register-account">账号</label>
          </div>
          <div className="svg-field svg-field-pwd">
            <input
              type={showRegisterPwd ? "text" : "password"}
              placeholder=" "
              id="sv-register-pwd"
              autoComplete="new-password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              required
            />
            <label htmlFor="sv-register-pwd">密码</label>
            <PasswordToggleButton visible={showRegisterPwd} onToggle={() => setShowRegisterPwd((v) => !v)} />
          </div>
          <div className="svg-field svg-field-pwd">
            <input
              type={showRegisterConfirmPwd ? "text" : "password"}
              placeholder=" "
              id="sv-register-confirm-pwd"
              autoComplete="new-password"
              value={registerConfirmPassword}
              onChange={(e) => setRegisterConfirmPassword(e.target.value)}
              required
            />
            <label htmlFor="sv-register-confirm-pwd">确认密码</label>
            <PasswordToggleButton
              visible={showRegisterConfirmPwd}
              onToggle={() => setShowRegisterConfirmPwd((v) => !v)}
            />
          </div>
          {registerError && (
            <p className="svg-form-error" role="alert">{registerError}</p>
          )}
          <div className="svg-form-actions">
            {registerSuccess ? (
              <p className="svg-form-pending" role="status">正在申请注册，请等待管理员审核</p>
            ) : (
              <button
                type="button"
                className="svg-submit"
                onClick={handleApplyRegister}
                disabled={isApplyingRegister}
                aria-busy={isApplyingRegister}
              >
                {isApplyingRegister ? "申请中……" : "申请注册"}
              </button>
            )}
            <button type="button" className="svg-submit svg-submit-secondary" onClick={handleBackToLogin}>
              返回登录
            </button>
          </div>
        </section>

        <section className={`svg-form-panel ${activeMode === "login" ? "is-active" : "is-inactive"}`}>
          <div className="svg-field">
            <input
              type="text"
              placeholder=" "
              id="sv-account"
              autoComplete="off"
              value={loginAccount}
              onChange={(e) => { setLoginAccount(e.target.value); setLoginError(""); }}
              onKeyDown={(e) => e.key === "Enter" && !isLoggingIn && void handleLogin()}
              required
            />
            <label htmlFor="sv-account">账号</label>
          </div>
          <div className="svg-field svg-field-pwd">
            <input
              type={showPwd ? "text" : "password"}
              placeholder=" "
              id="sv-pwd"
              autoComplete="new-password"
              value={loginPassword}
              onChange={(e) => { setLoginPassword(e.target.value); setLoginError(""); }}
              onKeyDown={(e) => e.key === "Enter" && !isLoggingIn && void handleLogin()}
              required
            />
            <label htmlFor="sv-pwd">密码</label>
            <PasswordToggleButton visible={showPwd} onToggle={() => setShowPwd((v) => !v)} />
          </div>
          {loginError && (
            <p className="svg-form-error" role="alert">{loginError}</p>
          )}
          <button
            type="button"
            className="svg-submit"
            onClick={() => void handleLogin()}
            disabled={isLoggingIn}
            aria-busy={isLoggingIn}
          >
            {isLoggingIn ? "登录中…" : "登录"}
          </button>
          <p className="svg-register">
            还没有账号？
            <button type="button" className="svg-inline-link" onClick={handleSwitchToRegister}>
              立即注册
            </button>
          </p>
        </section>
      </div>
    </form>
  );
}
