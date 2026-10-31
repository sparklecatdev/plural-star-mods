package dev.sparklecat.tools;

import java.io.File;
import java.util.*;
import org.jf.dexlib2.*;
import org.jf.dexlib2.builder.*;
import org.jf.dexlib2.builder.instruction.*;
import org.jf.dexlib2.iface.*;
import org.jf.dexlib2.immutable.*;
import org.jf.dexlib2.immutable.reference.ImmutableMethodReference;

/** Insert the notification delivery hook into the pinned native library. */
public final class PatchNotifications {
    public static void main(String[] args) throws Exception {
        DexFile original = DexFileFactory.loadDexFile(new File(args[0]), Opcodes.forApi(26));
        DexFile hook = DexFileFactory.loadDexFile(new File(args[1]), Opcodes.forApi(26));
        List<ClassDef> classes = new ArrayList<>();
        Set<String> types = new HashSet<>();
        int found = 0;
        for (ClassDef c : original.getClasses()) {
            types.add(c.getType());
            if (!c.getType().equals("Lapp/notifee/core/NotificationManager;")) { classes.add(c); continue; }
            List<Method> methods = new ArrayList<>();
            for (Method m : c.getMethods()) {
                if (!m.getName().equals("lambda$displayNotification$14")) { methods.add(m); continue; }
                if (!m.getParameterTypes().toString().equals("[Lapp/notifee/core/model/NotificationModel;, Landroid/os/Bundle;, Landroidx/core/app/NotificationCompat$Builder;]") ||
                    !m.getReturnType().equals("Lcom/google/common/util/concurrent/ListenableFuture;") || m.getImplementation().getRegisterCount() != 9)
                    throw new IllegalStateException("Unexpected notification method");
                MutableMethodImplementation body = new MutableMethodImplementation(m.getImplementation());
                body.addInstruction(0, new BuilderInstruction35c(Opcode.INVOKE_STATIC, 3, 6, 7, 8, 0, 0,
                    new ImmutableMethodReference("Lapp/notifee/core/RestModeHook;", "beforeDisplay",
                        List.of("Lapp/notifee/core/model/NotificationModel;", "Landroid/os/Bundle;", "Landroidx/core/app/NotificationCompat$Builder;"),
                        "Lcom/google/common/util/concurrent/ListenableFuture;")));
                body.addInstruction(1, new BuilderInstruction11x(Opcode.MOVE_RESULT_OBJECT, 0));
                body.addInstruction(2, new BuilderInstruction10x(Opcode.NOP));
                body.addInstruction(3, new BuilderInstruction11x(Opcode.RETURN_OBJECT, 0));
                body.replaceInstruction(2, new BuilderInstruction21t(Opcode.IF_EQZ, 0, body.newLabelForIndex(4)));
                methods.add(new ImmutableMethod(c.getType(), m.getName(), m.getParameters(), m.getReturnType(),
                    m.getAccessFlags(), m.getAnnotations(), m.getHiddenApiRestrictions(), body));
                found++;
            }
            classes.add(new ImmutableClassDef(c.getType(), c.getAccessFlags(), c.getSuperclass(), c.getInterfaces(),
                c.getSourceFile(), c.getAnnotations(), c.getFields(), methods));
        }
        if (found != 1) throw new IllegalStateException("Notification method not found exactly once");
        for (ClassDef c : hook.getClasses()) {
            if (!types.add(c.getType())) throw new IllegalStateException("Duplicate class: " + c.getType());
            classes.add(c);
        }
        DexFileFactory.writeDexFile(args[2], new ImmutableDexFile(original.getOpcodes(), classes));
    }
}
